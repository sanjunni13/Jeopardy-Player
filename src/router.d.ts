import '@tanstack/history'

declare module '@tanstack/history' {
  interface HistoryState {
    fromLibrary?: boolean
  }
}
