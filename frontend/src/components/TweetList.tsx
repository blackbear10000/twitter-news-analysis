import type { TweetRecord } from '../lib/api'

interface TweetListProps {
  tweets: TweetRecord[]
  total: number
}

export const TweetList = ({ tweets, total }: TweetListProps) => (
  <div className="panel">
    <div className="panel-header">
      <h3>Raw Tweets</h3>
      <span>{total} items</span>
    </div>
    <div className="tweet-list">
      {tweets.map((tweet) => (
        <article key={tweet.id} className="tweet-card">
          <header>
            <div>
              <strong>{tweet.author}</strong>
              <span>@{tweet.username}</span>
            </div>
            <time dateTime={tweet.created_at}>
              {new Date(tweet.created_at).toLocaleString()}
            </time>
          </header>
          <p>{tweet.content}</p>
          <footer>
            <span>❤️ {tweet.like_count ?? 0}</span>
            <span>🔁 {tweet.retweet_count ?? 0}</span>
            {tweet.language && <span className="badge">{tweet.language}</span>}
          </footer>
        </article>
      ))}
      {!tweets.length && <p className="empty-state">No tweets in this window.</p>}
    </div>
  </div>
)

