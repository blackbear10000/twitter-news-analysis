import type { InsightsResponse } from '../lib/api'
import { Graph } from './Graph'

interface KeyPersonPanelProps {
  insights?: InsightsResponse
}

export const KeyPersonPanel = ({ insights }: KeyPersonPanelProps) => {
  const keyPeople = (insights?.nodes ?? []).filter((node) => node.type === 'user')

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Key Person View</h3>
        <span>High-impact accounts</span>
      </div>
      <div className="topic-grid">
        <div>
          <ul className="topic-list">
            {keyPeople.map((person) => (
              <li key={person.id}>
                <strong>{person.label}</strong>
                <p>Interactions {person.weight.toFixed(0)}</p>
              </li>
            ))}
            {!keyPeople.length && <p className="empty-state">No key people yet.</p>}
          </ul>
        </div>
        <Graph nodes={insights?.nodes ?? []} edges={insights?.edges ?? []} />
      </div>
    </div>
  )
}

