import { useState, useEffect } from 'react'

import type { TweetRecord } from '../lib/api'

type TimelineRange = 'all' | '24h' | '7d' | '30d'
type TweetTypeFilter = 'all' | 'tweet' | 'retweet' | 'reply' | 'quote'

interface UserTweetViewProps {
  tweets: TweetRecord[]
  total: number
  username?: string
  range: TimelineRange
  onRangeChange: (value: TimelineRange) => void
  typeFilter: TweetTypeFilter
  onTypeFilterChange: (value: TweetTypeFilter) => void
  page: number
  onPageChange: (page: number) => void
  pageSize: number
  onPageSizeChange: (value: number) => void
  isLoading: boolean
}

const getTweetType = (tweet: TweetRecord): { type: TweetTypeFilter; label: string; icon: string } => {
  if (tweet.is_retweet) {
    return { type: 'retweet', label: 'Retweet', icon: '🔁' }
  }
  if (tweet.is_reply) {
    return { type: 'reply', label: 'Reply', icon: '💬' }
  }
  if (tweet.is_quoted) {
    return { type: 'quote', label: 'Quote', icon: '💭' }
  }
  return { type: 'tweet', label: 'Tweet', icon: '📝' }
}

export const UserTweetView = ({
  tweets,
  total,
  username,
  range,
  onRangeChange,
  typeFilter,
  onTypeFilterChange,
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
  isLoading,
}: UserTweetViewProps) => {
  const [pageInput, setPageInput] = useState(page.toString())

  // Sync page input with page prop - must be before any conditional returns
  useEffect(() => {
    setPageInput(page.toString())
  }, [page])

  if (!username) {
    return (
      <div className="panel user-tweet-panel">
        <div className="panel-header">
          <h3>User Timeline</h3>
          <p className="empty-state">Select a user to view their tweets</p>
        </div>
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const canPrev = page > 1
  const canNext = page < totalPages

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    onPageChange(newPage)
  }

  const handlePageInputChange = (value: string) => {
    setPageInput(value)
  }

  const handlePageInputSubmit = () => {
    const pageNum = parseInt(pageInput, 10)
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum)
    } else {
      setPageInput(page.toString())
    }
  }

  const handlePageInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handlePageInputSubmit()
    }
  }

  return (
    <div className="panel user-tweet-panel">
      <div className="panel-header">
        <h3>@{username} Timeline</h3>
        <span>{total} items</span>
      </div>

      <div className="timeline-controls">
        <label>
          Time Range
          <select
            className="input timeline-select"
            value={range}
            onChange={(event) => onRangeChange(event.target.value as TimelineRange)}
          >
            <option value="all">All time</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </label>
        <label>
          Type
          <select
            className="input timeline-select"
            value={typeFilter}
            onChange={(event) => onTypeFilterChange(event.target.value as TweetTypeFilter)}
          >
            <option value="all">All</option>
            <option value="tweet">Original</option>
            <option value="retweet">Retweet</option>
            <option value="reply">Reply</option>
            <option value="quote">Quote</option>
          </select>
        </label>
        <label>
          Items per page
          <select
            className="input timeline-select"
            value={pageSize}
            onChange={(event) => onPageSizeChange(parseInt(event.target.value, 10))}
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
        </label>
      </div>

      {isLoading && <div className="loading-state">Loading timeline…</div>}

      <div className="tweet-list">
        {tweets.map((tweet) => {
          const tweetType = getTweetType(tweet)
          return (
            <article
              key={tweet.id}
              className={`tweet-card tweet-card-${tweetType.type}`}
            >
              <header className="tweet-header">
                <div className={`tweet-type-badge tweet-type-badge-${tweetType.type}`}>
                  <span>{tweetType.icon}</span>
                  <span>{tweetType.label}</span>
                </div>
                <time dateTime={tweet.created_at}>
                  {new Date(tweet.created_at).toLocaleString()}
                </time>
              </header>
              <div className="tweet-author">
                <strong>{tweet.author}</strong>
                <span>@{tweet.username}</span>
              </div>
              <p className="tweet-content">{tweet.content}</p>
              {tweet.original_content && (
                <div className="tweet-original">
                  <p className="tweet-original-label">
                    {tweet.is_quoted ? 'Quoted:' : 'Original:'}
                  </p>
                  <p className="tweet-original-content">{tweet.original_content}</p>
                  {tweet.original_author && (
                    <p className="tweet-original-author">— @{tweet.original_author}</p>
                  )}
                </div>
              )}
              <footer className="tweet-footer">
                <span>❤️ {tweet.like_count ?? 0}</span>
                <span>🔁 {tweet.retweet_count ?? 0}</span>
                {tweet.language && <span className="badge">{tweet.language}</span>}
                {tweet.url && (
                  <a href={tweet.url} target="_blank" rel="noopener noreferrer" className="tweet-link">
                    View Tweet
                  </a>
                )}
              </footer>
            </article>
          )
        })}
        {!tweets.length && !isLoading && (
          <p className="empty-state">No tweets found for this user.</p>
        )}
      </div>

      <div className="pagination-controls">
        <button
          className="small-button"
          type="button"
          onClick={() => handlePageChange(page - 1)}
          disabled={!canPrev}
        >
          Previous
        </button>
        <div className="pagination-page-input">
          <span>Page</span>
          <input
            type="number"
            className="input page-number-input"
            value={pageInput}
            onChange={(e) => handlePageInputChange(e.target.value)}
            onBlur={handlePageInputSubmit}
            onKeyPress={handlePageInputKeyPress}
            min={1}
            max={totalPages}
          />
          <span>of {totalPages}</span>
        </div>
        <button
          className="small-button"
          type="button"
          onClick={() => handlePageChange(page + 1)}
          disabled={!canNext}
        >
          Next
        </button>
      </div>
    </div>
  )
}
