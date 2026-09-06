import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from '@tanstack/react-router';
import { PlayerJoinPage } from '../../components/player/PlayerJoinPage';
import { BuzzerPage } from '../../components/player/BuzzerPage';
import { FinalJeopardyEntryPage } from '../../components/player/FinalJeopardyEntryPage';
import { SessionEndedPage } from '../../components/player/SessionEndedPage';
import { ConnectionStatusBanner } from '../../components/player/ConnectionStatusBanner';
import { PlayerAuctionPanel } from '../../components/player/PlayerAuctionPanel';
import { PlayerBettingPanel } from '../../components/player/PlayerBettingPanel';
import { CategoryWinToast } from '../../components/player/CategoryWinToast';
import { useGameSession } from '../../hooks/useGameSession';
import { broadcastMessage, trackPresence, untrackPresence, onChannelMessage } from '../../utils/sessionChannel';
import {
  persistBettingSnapshot,
  restoreBettingSnapshot,
  clearBettingSnapshot,
} from '../../utils/bettingSnapshot';
import type { ChannelMessage, PlayerBudgetView } from '../../types/session';

/**
 * Route page for /play/$sessionId.
 *
 * This is a public, unauthenticated route that players navigate to by scanning a QR code.
 * It manages the top-level player flow: join → phase-based interaction (buzzer, final jeopardy, ended).
 */
export function PlaySessionPage() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };

  // Auto-restore player name from sessionStorage if they previously joined this session
  const storageKey = `buzzer_name_${sessionId}`;
  const [playerName, setPlayerName] = useState<string | null>(
    () => sessionStorage.getItem(storageKey)
  );
  const { session, connectionState, channel, error } = useGameSession(
    playerName ? sessionId : undefined
  );

  // Track if this player has been removed by the host
  const [removedByHost, setRemovedByHost] = useState(false);

  // ─── Gambling phase state ───────────────────────────────────────────────────

  // The betting phase only exists in memory and over the channel — the persisted
  // session phase stays 'buzzer'. A tab-scoped snapshot lets a reload mid-betting
  // land back on the betting panel instead of the generic buzzer screen.
  const [restoredBetting] = useState(() => restoreBettingSnapshot(sessionId));

  const [gamblingPhase, setGamblingPhase] = useState<'idle' | 'auction' | 'betting'>(
    restoredBetting ? 'betting' : 'idle'
  );
  const [auctionData, setAuctionData] = useState<{
    category: string;
    categoryIndex: number;
    roundName: string;
    timerDuration: number;
    playerBalances: Record<string, number>;
    // Spendable_Budget per player, absent when the host is running older code.
    budgets?: Record<string, PlayerBudgetView>;
  } | null>(null);
  const [auctionKey, setAuctionKey] = useState(0);
  // Structured toast data; the toast owns its own lifetime and formats the amount.
  const [auctionWinMessage, setAuctionWinMessage] = useState<
    { category: string; winningBid: number } | null
  >(null);
  const auctionCategoryRef = useRef<string>('');
  type BettingData = {
    availableBets: { betType: string; description: string }[];
    timerDuration: number;
    playerBalances: Record<string, number>;
    // Spendable_Budget per player, absent when the host is running older code.
    // Not part of the persisted snapshot: a reload lands back on the fallback,
    // which is the same behaviour an older host tab produces.
    budgets?: Record<string, PlayerBudgetView>;
  };
  const [bettingData, setBettingData] = useState<BettingData | null>(
    restoredBetting
      ? {
          availableBets: restoredBetting.availableBets,
          timerDuration: restoredBetting.timerDuration,
          playerBalances: restoredBetting.playerBalances,
        }
      : null
  );
  // Read by the snapshot writer, which must see the current betting data even when
  // it is invoked from a child effect that runs before this component's effects.
  const bettingDataRef = useRef<BettingData | null>(
    restoredBetting
      ? {
          availableBets: restoredBetting.availableBets,
          timerDuration: restoredBetting.timerDuration,
          playerBalances: restoredBetting.playerBalances,
        }
      : null
  );
  // What the betting panel starts from: the restored snapshot after a reload, an
  // empty slate on a fresh `betting_start`.
  const [bettingSeed, setBettingSeed] = useState<{
    placedBets: { betType: string; wager: number; prediction: string }[];
    finalized: boolean;
  }>(
    restoredBetting
      ? { placedBets: restoredBetting.placedBets, finalized: restoredBetting.finalized }
      : { placedBets: [], finalized: false }
  );
  const [localBalance, setLocalBalance] = useState<number | null>(
    restoredBetting && playerName ? restoredBetting.playerBalances[playerName] ?? null : null
  );

  // Listen for player_removed messages targeting this player
  useEffect(() => {
    if (!channel || !playerName) return;
    const handler = (message: ChannelMessage) => {
      if (message.type === 'player_removed' && message.playerName.toLowerCase() === playerName.toLowerCase()) {
        setRemovedByHost(true);
        // Clear stored name so they can rejoin with a new/same name later
        sessionStorage.removeItem(storageKey);
      }
    };
    onChannelMessage(channel, handler);
  }, [channel, playerName, storageKey]);

  // Listen for gambling-related channel messages
  useEffect(() => {
    if (!channel || !playerName) return;
    const handler = (message: ChannelMessage) => {
      switch (message.type) {
        case 'auction_start':
          setAuctionData({
            category: message.category,
            categoryIndex: message.categoryIndex,
            roundName: message.roundName,
            timerDuration: message.timerDuration,
            playerBalances: message.playerBalances,
            budgets: message.budgets,
          });
          setAuctionKey(prev => prev + 1);
          setAuctionWinMessage(null);
          auctionCategoryRef.current = message.category;
          setLocalBalance(message.playerBalances[playerName] ?? null);
          setGamblingPhase('auction');
          break;

        case 'betting_start': {
          const data: BettingData = {
            availableBets: message.availableBets,
            timerDuration: message.timerDuration,
            playerBalances: message.playerBalances,
            budgets: message.budgets,
          };
          bettingDataRef.current = data;
          setBettingData(data);
          setBettingSeed({ placedBets: [], finalized: false });
          setLocalBalance(message.playerBalances[playerName] ?? null);
          setGamblingPhase('betting');
          // Survive a reload during betting (design Change 10)
          persistBettingSnapshot(sessionId, {
            availableBets: data.availableBets,
            timerDuration: data.timerDuration,
            playerBalances: data.playerBalances,
            placedBets: [],
            finalized: false,
          });
          break;
        }

        case 'auction_complete':
          setGamblingPhase('idle');
          setAuctionData(null);
          break;

        case 'auction_result':
          // Show win/loss feedback to the player but don't dismiss the panel.
          // Balance updates come via gambling_balance_update.
          if (message.winner === playerName) {
            setAuctionWinMessage({
              category: auctionCategoryRef.current || 'a category',
              winningBid: message.winningBid,
            });
          } else if (message.winner === null) {
            setAuctionWinMessage(null); // tie or release — no feedback needed
          } else {
            setAuctionWinMessage(null);
          }
          break;

        case 'betting_complete':
          setGamblingPhase('idle');
          setBettingData(null);
          bettingDataRef.current = null;
          clearBettingSnapshot(sessionId);
          break;

        case 'session_ended':
          setGamblingPhase('idle');
          setBettingData(null);
          bettingDataRef.current = null;
          clearBettingSnapshot(sessionId);
          break;

        case 'gambling_balance_update':
          if (message.balances[playerName] !== undefined) {
            setLocalBalance(message.balances[playerName]);
          }
          break;
      }
    };
    onChannelMessage(channel, handler);
  }, [channel, playerName, sessionId]);

  // The panel owns the placed bets / finalized flag; the page owns the rest of the
  // snapshot, so persistence lives here.
  const handleBettingSnapshotChange = useCallback(
    (state: { placedBets: { betType: string; wager: number; prediction: string }[]; finalized: boolean }) => {
      const data = bettingDataRef.current;
      if (!data) return;
      persistBettingSnapshot(sessionId, {
        availableBets: data.availableBets,
        timerDuration: data.timerDuration,
        playerBalances: data.playerBalances,
        placedBets: state.placedBets,
        finalized: state.finalized,
      });
    },
    [sessionId]
  );

  // Track whether we've broadcast the join/rejoin message for this player
  const hasBroadcastJoin = useRef(false);

  // The toast owns its 5-second lifetime and reports back here when it expires.
  const handleAuctionWinToastDismiss = useCallback(() => {
    setAuctionWinMessage(null);
  }, []);

  // Callbacks for gambling panels
  const handleAuctionBidSubmitted = useCallback(() => {
    // Bid submitted — panel shows confirmation; phase stays 'auction' until host sends auction_complete/auction_result
  }, []);

  const handleBettingDone = useCallback(() => {
    // Broadcast to host that this player is done betting
    if (channel && playerName) {
      broadcastMessage(channel, { type: 'betting_done', playerName }).catch(() => {});
    }
  }, [channel, playerName]);

  // Broadcast player_joined once (first connection only)
  useEffect(() => {
    if (!playerName || !channel || connectionState !== 'connected' || hasBroadcastJoin.current) return;

    hasBroadcastJoin.current = true;

    // Broadcast join message to host
    broadcastMessage(channel, {
      type: 'player_joined',
      player: { name: playerName, score: 0, joinedAt: new Date().toISOString() },
    }).catch(() => {});
  }, [playerName, channel, connectionState]);

  // Track presence on every channel connection (including reconnects)
  useEffect(() => {
    if (!playerName || !channel || connectionState !== 'connected') return;

    trackPresence(channel, {
      playerName,
      joinedAt: new Date().toISOString(),
    }).catch(() => {});

    return () => {
      untrackPresence(channel).catch(() => {});
    };
  }, [playerName, channel, connectionState]);

  // Show removed notification if the host removed this player
  if (removedByHost) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#f1f5f9', textAlign: 'center', padding: '1rem' }}>
        <div style={{ maxWidth: '20rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#f87171' }}>Removed from Game</h2>
          <p style={{ color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.5 }}>
            You have been removed from the player list by the host. Once you have been re-added, you can rejoin.
          </p>
          <button
            type="button"
            onClick={() => { setRemovedByHost(false); setPlayerName(null); hasBroadcastJoin.current = false; }}
            style={{ padding: '0.75rem 1.5rem', borderRadius: '9999px', background: '#6A1B9A', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
          >
            Rejoin
          </button>
        </div>
      </div>
    );
  }

  // Before joining, show the join page
  if (!playerName) {
    return <PlayerJoinPage sessionId={sessionId} onJoined={setPlayerName} />;
  }

  // Derive the player's score from the session state
  const player = session?.players.find(
    (p) => p.name.toLowerCase() === playerName.toLowerCase()
  );
  const playerScore = player?.score ?? 0;

  // Render the appropriate phase-based content
  function renderPhaseContent() {
    // The caller only reaches this after the join gate above, so a null name is
    // unreachable; the guard keeps the narrowed `string` type inside the closure.
    if (!playerName) return null;

    // If we haven't loaded session yet, show a loading/waiting state
    if (!session) {
      return (
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#f1f5f9', textAlign: 'center', padding: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Welcome, {playerName}!</h2>
            <p style={{ color: '#94a3b8' }}>Connecting to session…</p>
          </div>
        </div>
      );
    }

    // Gambling phase takes priority — show auction/betting panels when active
    if (gamblingPhase === 'auction' && auctionData) {
      const balance = localBalance ?? auctionData.playerBalances[playerName] ?? 0;
      // The broadcast view carries the frozen classification and unspent pool;
      // Real_Balance tracks `gambling_balance_update` so it stays current. When
      // the field is missing the panel applies its own Real_Balance fallback.
      const broadcastBudget = auctionData.budgets?.[playerName];
      const budget: PlayerBudgetView | undefined = broadcastBudget
        ? { ...broadcastBudget, realBalance: localBalance ?? broadcastBudget.realBalance }
        : undefined;
      return (
        <PlayerAuctionPanel
          key={`auction-${auctionKey}`}
          category={auctionData.category}
          categoryIndex={auctionData.categoryIndex}
          roundName={auctionData.roundName}
          playerBalance={balance}
          timerDuration={auctionData.timerDuration}
          channel={channel}
          playerName={playerName}
          onBidSubmitted={handleAuctionBidSubmitted}
          budget={budget}
        />
      );
    }
    // A restored snapshot can outlive its betting phase if the tab missed
    // `betting_complete`, so phases where betting cannot be active win over it.
    const bettingPossible = session.phase !== 'ended' && session.phase !== 'final-jeopardy';
    if (gamblingPhase === 'betting' && bettingData && bettingPossible) {
      const balance = localBalance ?? bettingData.playerBalances[playerName] ?? 0;
      // Derive player names from session or from the balance keys in the betting_start message
      const playerNames = session.players.length > 0
        ? session.players.map(p => p.name)
        : Object.keys(bettingData.playerBalances);
      // The broadcast view carries the frozen classification and the pool the
      // Auction_Phase already drew down; Real_Balance tracks
      // `gambling_balance_update` so it stays current. When the field is missing
      // the panel applies its own Real_Balance fallback.
      const broadcastBettingBudget = bettingData.budgets?.[playerName];
      const bettingBudget: PlayerBudgetView | undefined = broadcastBettingBudget
        ? { ...broadcastBettingBudget, realBalance: localBalance ?? broadcastBettingBudget.realBalance }
        : undefined;
      return (
        <PlayerBettingPanel
          availableBets={bettingData.availableBets}
          playerBalance={balance}
          timerDuration={bettingData.timerDuration}
          channel={channel}
          playerName={playerName}
          players={playerNames}
          onBettingDone={handleBettingDone}
          initialPlacedBets={bettingSeed.placedBets}
          initialFinalized={bettingSeed.finalized}
          onSnapshotChange={handleBettingSnapshotChange}
          budget={bettingBudget}
        />
      );
    }

    switch (session.phase) {
      case 'ended':
        return <SessionEndedPage />;

      case 'final-jeopardy':
        return (
          <FinalJeopardyEntryPage
            sessionId={sessionId}
            playerName={playerName}
            playerScore={playerScore}
            channel={channel}
            submissionsLocked={!session.buzz_state.clueActive}
            players={session.players}
            teamPool={session.team_pool}
            targetScore={session.target_score}
            coopMode={session.coop_mode ?? false}
          />
        );

      case 'buzzer':
        // Normal buzzer UI
        if (session.buzz_state.clueActive) {
          return (
            <BuzzerPage
              playerName={playerName}
              buzzState={session.buzz_state}
              channel={channel}
            />
          );
        }
        // Buzzer phase but no clue active — show buzzer in disabled/waiting state
        return (
          <BuzzerPage
            playerName={playerName}
            buzzState={session.buzz_state}
            channel={channel}
          />
        );

      case 'lobby':
      default:
        return (
          <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#f1f5f9', textAlign: 'center', padding: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Welcome, {playerName}!</h2>
              <p style={{ color: '#94a3b8' }}>Waiting for the game to begin…</p>
            </div>
          </div>
        );
    }
  }

  return (
    <>
      <ConnectionStatusBanner
        connectionState={connectionState}
        error={error}
      />
      {auctionWinMessage && (
        <CategoryWinToast
          category={auctionWinMessage.category}
          winningBid={auctionWinMessage.winningBid}
          onDismiss={handleAuctionWinToastDismiss}
        />
      )}
      {renderPhaseContent()}
    </>
  );
}
