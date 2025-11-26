import { useQuery } from '@tanstack/react-query'

import { fetchSnapshotRelatedTweets, type RelatedTweet } from '../lib/api'

interface TweetModalProps {
  snapshotId: string
  nodeId: string | null
  nodeLabel: string
  nodeType: 'user' | 'topic'
  onClose: () => void
}

export const TweetModal = ({ snapshotId, nodeId, nodeLabel, nodeType, onClose }: TweetModalProps) => {
  const tweetsQuery = useQuery({
    queryKey: ['snapshot-tweets', snapshotId, nodeId],
    queryFn: () => fetchSnapshotRelatedTweets(snapshotId, nodeId!, 30),
    enabled: Boolean(nodeId && snapshotId),
  })

  if (!nodeId) return null

  const getTweetType = (tweet: RelatedTweet) => {
    if (tweet.is_retweet) return { type: 'retweet', label: 'Retweet', icon: '🔁' }
    if (tweet.is_reply) return { type: 'reply', label: 'Reply', icon: '💬' }
    if (tweet.is_quoted) return { type: 'quote', label: 'Quote', icon: '💭' }
    return { type: 'tweet', label: 'Tweet', icon: '📝' }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content tweet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {nodeType === 'user' ? '@' : ''}
            {nodeLabel} - Related Tweets
          </h3>
          <button className="modal-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {tweetsQuery.isLoading ? (
            <div className="loading-state">Loading tweets...</div>
          ) : tweetsQuery.error ? (
            <div className="empty-state">Failed to load tweets</div>
          ) : tweetsQuery.data && tweetsQuery.data.length > 0 ? (
            <div className="tweet-list">
              {tweetsQuery.data.map((tweet) => {
                const tweetType = getTweetType(tweet)
                return (
                  <article key={tweet.id} className={`tweet-card tweet-card-${tweetType.type}`}>
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
                      <strong>@{tweet.username || tweet.author}</strong>
                    </div>
                    <div className="tweet-content">
                      <p>{tweet.content}</p>
                      {tweet.image && (
                        <img src={tweet.image} alt="Tweet image" className="tweet-image" />
                      )}
                      {(tweet.original_content || tweet.is_quoted || tweet.is_retweet) && (
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
                    </div>
                    <footer className="tweet-footer">
                      <span>❤️ {tweet.like_count ?? 0}</span>
                      <span>🔁 {tweet.retweet_count ?? 0}</span>
                      {tweet.language && <span className="badge">{tweet.language}</span>}
                      {tweet.url && (
                        <a
                          href={tweet.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tweet-link"
                        >
                          View Tweet
                        </a>
                      )}
                    </footer>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="empty-state">No related tweets found</div>
          )}
        </div>
      </div>
    </div>
  )
}

