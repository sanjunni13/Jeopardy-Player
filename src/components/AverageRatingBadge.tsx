interface AverageRatingBadgeProps {
  averageRating: number | null
  ratingCount: number
}

export function AverageRatingBadge({ averageRating, ratingCount }: AverageRatingBadgeProps) {
  if (averageRating === null) {
    return (
      <span
        className="average-rating-badge"
        aria-label="No ratings"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: '0.8125rem',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgb(100 116 139)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span style={{ color: 'rgb(100 116 139)' }}>No ratings</span>
      </span>
    )
  }

  return (
    <span
      className="average-rating-badge"
      aria-label={`Average rating: ${averageRating} out of 5 from ${ratingCount} ${ratingCount === 1 ? 'rating' : 'ratings'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontSize: '0.8125rem',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="rgb(250 204 21)"
        stroke="rgb(250 204 21)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      <span style={{ color: 'rgb(203 213 225)' }}>{averageRating}</span>
      <span style={{ color: 'rgb(203 213 225)' }}>({ratingCount})</span>
    </span>
  )
}
