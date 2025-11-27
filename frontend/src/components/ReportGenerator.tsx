import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import {
  type BusinessLine,
  type Member,
  type TweetRecord,
  fetchBusinessLines,
  fetchMembers,
  filterTweets,
  generateHistoricalReport,
  type HistoricalReportCreate,
} from '../lib/api'
import { useAuthStore } from '../store/useAuthStore'

export const ReportGenerator = () => {
  const token = useAuthStore((state) => state.token)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  const businessLinesQuery = useQuery({
    queryKey: ['business-lines'],
    queryFn: fetchBusinessLines,
    enabled: Boolean(token),
  })

  const membersQuery = useQuery({
    queryKey: ['members', selectedLineId],
    queryFn: () => fetchMembers(selectedLineId!),
    enabled: Boolean(token && selectedLineId),
    onSuccess: (members) => {
      // Auto-select all members by default
      if (members.length > 0 && selectedUserIds.size === 0) {
        setSelectedUserIds(new Set(members.map((m) => m.twitter_id)))
      }
    },
  })

  const filterTweetsMutation = useMutation({
    mutationFn: filterTweets,
  })

  const generateReportMutation = useMutation({
    mutationFn: generateHistoricalReport,
    onSuccess: () => {
      alert('Report generated successfully!')
      setShowPreview(false)
      // Reset form
      setStartDate('')
      setEndDate('')
      setSelectedUserIds(new Set())
    },
  })

  const handleLineChange = (lineId: string) => {
    setSelectedLineId(lineId)
    setSelectedUserIds(new Set())
    setShowPreview(false)
  }

  const handleToggleUser = (twitterId: string) => {
    const newSet = new Set(selectedUserIds)
    if (newSet.has(twitterId)) {
      newSet.delete(twitterId)
    } else {
      newSet.add(twitterId)
    }
    setSelectedUserIds(newSet)
  }

  const handleSelectAll = () => {
    if (membersQuery.data) {
      setSelectedUserIds(new Set(membersQuery.data.map((m) => m.twitter_id)))
    }
  }

  const handleDeselectAll = () => {
    setSelectedUserIds(new Set())
  }

  const handlePreview = async () => {
    if (!selectedLineId || selectedUserIds.size === 0 || !startDate || !endDate) {
      alert('Please select a business line, at least one user, and date range')
      return
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    if (start >= end) {
      alert('Start date must be before end date')
      return
    }

    // Check if date range is more than 7 days
    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff > 7) {
      alert('Date range cannot exceed 7 days')
      return
    }

    try {
      await filterTweetsMutation.mutateAsync({
        twitter_ids: Array.from(selectedUserIds),
        start_date: startDate,
        end_date: endDate,
        skip: 0,
        limit: 0, // 0 means no limit, get all tweets
      })
      setShowPreview(true)
    } catch (error) {
      console.error('Failed to preview tweets:', error)
      alert('Failed to preview tweets')
    }
  }

  const handleGenerateReport = async () => {
    if (!selectedLineId || selectedUserIds.size === 0 || !startDate || !endDate) {
      alert('Please select a business line, at least one user, and date range')
      return
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    if (start >= end) {
      alert('Start date must be before end date')
      return
    }

    // Check if date range is more than 7 days
    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff > 7) {
      alert('Date range cannot exceed 7 days')
      return
    }

    if (
      !confirm(
        `Generate report for ${selectedUserIds.size} user(s) from ${startDate} to ${endDate}?`
      )
    ) {
      return
    }

    try {
      await generateReportMutation.mutateAsync({
        business_line_id: selectedLineId,
        selected_user_ids: Array.from(selectedUserIds),
        start_date: startDate,
        end_date: endDate,
      })
    } catch (error) {
      console.error('Failed to generate report:', error)
      alert('Failed to generate report')
    }
  }

  const previewTweets = filterTweetsMutation.data?.records ?? []
  const previewTotal = filterTweetsMutation.data?.total ?? 0

  const getTweetType = (tweet: TweetRecord): { type: string; label: string; icon: string } => {
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

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Generate Historical Report</h1>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          Business Line
        </label>
        <select
          value={selectedLineId || ''}
          onChange={(e) => handleLineChange(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            fontSize: '1rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          <option value="">Select a business line</option>
          {businessLinesQuery.data?.map((line) => (
            <option key={line.id} value={line.id}>
              {line.name}
            </option>
          ))}
        </select>
      </div>

      {selectedLineId && membersQuery.data && (
        <>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <label style={{ fontWeight: 'bold' }}>Twitter Users</label>
              <div>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{
                    marginRight: '0.5rem',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.875rem',
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                >
                  Deselect All
                </button>
              </div>
            </div>
            <div
              style={{
                border: '1px solid #ccc',
                borderRadius: '4px',
                padding: '1rem',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              {membersQuery.data.map((member) => (
                <label
                  key={member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.5rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedUserIds.has(member.twitter_id)}
                    onChange={() => handleToggleUser(member.twitter_id)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>
                    {member.twitter_id}
                    {member.description && (
                      <span style={{ color: '#666', marginLeft: '0.5rem' }}>
                        ({member.description})
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <div style={{ marginBottom: '0.5rem', color: '#64748b', fontSize: '0.875rem' }}>
              <span>ℹ️ Date range is limited to a maximum of 7 days</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Start Date
                </label>
                <input
                  type="datetime-local"
                  value={startDate}
                  min={endDate ? (() => {
                    const end = new Date(endDate)
                    const minStart = new Date(end)
                    minStart.setDate(minStart.getDate() - 7)
                    return minStart.toISOString().slice(0, 16)
                  })() : undefined}
                  max={endDate || undefined}
                  onChange={(e) => {
                    const newStartDate = e.target.value
                    setStartDate(newStartDate)
                    // Validate date range when start date changes
                    if (endDate && newStartDate) {
                      const start = new Date(newStartDate)
                      const end = new Date(endDate)
                      const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
                      if (daysDiff > 7) {
                        // Auto-adjust end date to be 7 days after start date
                        const maxEnd = new Date(start)
                        maxEnd.setDate(maxEnd.getDate() + 7)
                        setEndDate(maxEnd.toISOString().slice(0, 16))
                      } else if (daysDiff < 0) {
                        // If start date is after end date, adjust end date to be same as start
                        setEndDate(newStartDate)
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    fontSize: '1rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  End Date
                </label>
                <input
                  type="datetime-local"
                  value={endDate}
                  min={startDate || undefined}
                  max={startDate ? (() => {
                    const start = new Date(startDate)
                    const maxEnd = new Date(start)
                    maxEnd.setDate(maxEnd.getDate() + 7)
                    return maxEnd.toISOString().slice(0, 16)
                  })() : undefined}
                  onChange={(e) => {
                    const newEndDate = e.target.value
                    setEndDate(newEndDate)
                    // Validate date range when end date changes
                    if (startDate && newEndDate) {
                      const start = new Date(startDate)
                      const end = new Date(newEndDate)
                      const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
                      if (daysDiff > 7) {
                        // Auto-adjust start date to be 7 days before end date
                        const maxStart = new Date(end)
                        maxStart.setDate(maxStart.getDate() - 7)
                        setStartDate(maxStart.toISOString().slice(0, 16))
                      } else if (daysDiff < 0) {
                        // If end date is before start date, adjust start date to be same as end
                        setStartDate(newEndDate)
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    fontSize: '1rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={handlePreview}
              disabled={
                selectedUserIds.size === 0 ||
                !startDate ||
                !endDate ||
                filterTweetsMutation.isPending
              }
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {filterTweetsMutation.isPending ? 'Loading...' : 'Preview Tweets'}
            </button>
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={
                selectedUserIds.size === 0 ||
                !startDate ||
                !endDate ||
                generateReportMutation.isPending
              }
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {generateReportMutation.isPending ? 'Generating...' : 'Generate Report'}
            </button>
          </div>

          {showPreview && (
            <div style={{ marginTop: '2rem' }}>
              <h2>Preview ({previewTotal} tweets)</h2>
              <div
                style={{
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  padding: '1rem',
                  maxHeight: '600px',
                  overflowY: 'auto',
                  backgroundColor: '#1e293b',
                }}
              >
                {previewTweets.length === 0 ? (
                  <p style={{ color: '#e5e7eb', padding: '1rem' }}>
                    No tweets found in the specified date range
                  </p>
                ) : (
                  previewTweets.map((tweet) => {
                    const tweetType = getTweetType(tweet)
                    return (
                      <article
                        key={tweet.id}
                        className={`tweet-card tweet-card-${tweetType.type}`}
                        style={{
                          marginBottom: '1rem',
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          color: '#e5e7eb',
                        }}
                      >
                        <header className="tweet-header" style={{ marginBottom: '0.5rem' }}>
                          <div className={`tweet-type-badge tweet-type-badge-${tweetType.type}`}>
                            <span>{tweetType.icon}</span>
                            <span>{tweetType.label}</span>
                          </div>
                          <time
                            dateTime={tweet.created_at}
                            style={{ color: '#94a3b8', fontSize: '0.875rem' }}
                          >
                            {new Date(tweet.created_at).toLocaleString()}
                          </time>
                        </header>
                        <div className="tweet-author" style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ color: '#e5e7eb' }}>{tweet.author}</strong>
                          <span style={{ color: '#94a3b8', marginLeft: '0.5rem' }}>
                            @{tweet.username}
                          </span>
                        </div>
                        <p className="tweet-content" style={{ color: '#e5e7eb', margin: '0.5rem 0' }}>
                          {tweet.content}
                        </p>
                        {tweet.original_content && (
                          <div
                            className="tweet-original"
                            style={{
                              marginTop: '0.5rem',
                              padding: '0.75rem',
                              backgroundColor: '#0f172a',
                              borderRadius: '4px',
                              borderLeft: '3px solid #475569',
                            }}
                          >
                            <p
                              className="tweet-original-label"
                              style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.25rem' }}
                            >
                              {tweet.is_quoted ? 'Quoted:' : 'Original:'}
                            </p>
                            <p className="tweet-original-content" style={{ color: '#cbd5e1', margin: 0 }}>
                              {tweet.original_content}
                            </p>
                            {tweet.original_author && (
                              <p
                                className="tweet-original-author"
                                style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem', margin: 0 }}
                              >
                                — @{tweet.original_author}
                              </p>
                            )}
                          </div>
                        )}
                        <footer
                          className="tweet-footer"
                          style={{
                            marginTop: '0.5rem',
                            paddingTop: '0.5rem',
                            borderTop: '1px solid #334155',
                            display: 'flex',
                            gap: '1rem',
                            fontSize: '0.875rem',
                            color: '#94a3b8',
                          }}
                        >
                          <span>❤️ {tweet.like_count ?? 0}</span>
                          <span>🔁 {tweet.retweet_count ?? 0}</span>
                          {tweet.language && (
                            <span className="badge" style={{ backgroundColor: '#475569', color: '#e5e7eb' }}>
                              {tweet.language}
                            </span>
                          )}
                          {tweet.url && (
                            <a
                              href={tweet.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tweet-link"
                              style={{ color: '#3b82f6', textDecoration: 'none' }}
                            >
                              View Tweet
                            </a>
                          )}
                        </footer>
                      </article>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

