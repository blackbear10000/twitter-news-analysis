import type { InsightsResponse } from '../lib/api'
import { Graph } from './Graph'

interface TopicPanelProps {
  insights?: InsightsResponse
}

export const TopicPanel = ({ insights }: TopicPanelProps) => (
  <div className="panel">
    <div className="panel-header">
      <h3>Topic View</h3>
      <span>Top correlations</span>
    </div>
    <div className="topic-grid">
      <div>
        <ul className="topic-list">
          {insights?.topics.map((topic) => (
            <li key={topic.topic}>
              <strong>{topic.topic}</strong>
              <p>{topic.summary}</p>
              <span className="badge">Score {topic.score.toFixed(1)}</span>
            </li>
          ))}
          {!insights?.topics?.length && <p className="empty-state">Awaiting topics.</p>}
        </ul>
      </div>
      <Graph nodes={insights?.nodes ?? []} edges={insights?.edges ?? []} />
    </div>
  </div>
)

