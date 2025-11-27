import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Graph } from './Graph'
import { TweetModal } from './TweetModal'
import {
  fetchLatestSnapshot,
  fetchPublicSnapshot,
  fetchPublicSnapshots,
  type InsightSnapshot,
} from '../lib/api'

export const PublicVisualization = () => {
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [selectedBusinessLineId, setSelectedBusinessLineId] = useState<string | null>(null)
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null)
  const [selectedNodeForTweets, setSelectedNodeForTweets] = useState<{
    id: string
    label: string
    type: 'user' | 'topic'
  } | null>(null)

  // Fetch available snapshots
  const snapshotsQuery = useQuery({
    queryKey: ['public-snapshots', selectedBusinessLineId],
    queryFn: () =>
      fetchPublicSnapshots({
        business_line_id: selectedBusinessLineId || undefined,
        limit: 100,
      }),
  })

  // Fetch selected snapshot or latest
  const snapshotQuery = useQuery({
    queryKey: ['public-snapshot', selectedSnapshotId],
    queryFn: async () => {
      if (selectedSnapshotId) {
        return fetchPublicSnapshot(selectedSnapshotId)
      }
      const latest = await fetchLatestSnapshot(selectedBusinessLineId || undefined)
      if (!latest) {
        throw new Error('No snapshots available')
      }
      return latest
    },
    enabled: Boolean(selectedSnapshotId || !snapshotsQuery.isLoading),
    retry: false,
  })

  const snapshot: InsightSnapshot | null = snapshotQuery.data || null

  // Build topic score map and filter out persons not connected to topics
  const topicScoreMap = useMemo(() => {
    if (!snapshot) return new Map<string, number>()
    const map = new Map<string, number>()
    snapshot.topics.forEach((topic) => {
      map.set(`topic:${topic.topic}`, topic.score)
    })
    return map
  }, [snapshot])

  // Get set of person IDs that are connected to at least one topic
  const personsConnectedToTopics = useMemo(() => {
    if (!snapshot) return new Set<string>()
    const connected = new Set<string>()
    snapshot.edges.forEach((edge) => {
      if (edge.source.startsWith('user:') && edge.target.startsWith('topic:')) {
        connected.add(edge.source)
      }
    })
    return connected
  }, [snapshot])

  // Count topic connections for each person
  const personTopicConnectionCount = useMemo(() => {
    if (!snapshot) return new Map<string, number>()
    const counts = new Map<string, number>()
    snapshot.edges.forEach((edge) => {
      if (edge.source.startsWith('user:') && edge.target.startsWith('topic:')) {
        const current = counts.get(edge.source) || 0
        counts.set(edge.source, current + 1)
      }
    })
    return counts
  }, [snapshot])

  // Memoize nodes and edges to prevent unnecessary Graph re-renders
  // Filter out persons not connected to any topic
  const graphNodes = useMemo(() => {
    if (!snapshot) return []
    return snapshot.nodes.filter((node) => {
      if (node.type === 'topic') return true
      if (node.type === 'user') {
        return personsConnectedToTopics.has(node.id)
      }
      return true
    })
  }, [snapshot?.id, personsConnectedToTopics]) // Only change when snapshot ID changes

  const graphEdges = useMemo(() => {
    if (!snapshot) return []
    // Filter edges to only include those where both nodes are in the filtered graphNodes
    const validNodeIds = new Set(graphNodes.map((n) => n.id))
    return snapshot.edges.filter(
      (edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target)
    )
  }, [snapshot?.id, graphNodes]) // Only change when snapshot ID changes

  // Get unique business lines from snapshots
  const businessLinesMap = new Map<string, { id: string; name: string }>()
  snapshotsQuery.data?.forEach((s) => {
    if (s.business_line_id && !businessLinesMap.has(s.business_line_id)) {
      businessLinesMap.set(s.business_line_id, {
        id: s.business_line_id,
        name: s.business_line_name || 'Unknown',
      })
    }
  })
  const businessLines = Array.from(businessLinesMap.values())

  // Get top topics (sorted by score)
  const topTopics = useMemo(() => {
    if (!snapshot) return []
    return [...snapshot.topics].sort((a, b) => b.score - a.score).slice(0, 10)
  }, [snapshot])

  // Get top key persons (sorted by weight) - only those connected to topics
  const topKeyPersons = useMemo(() => {
    if (!snapshot) return []
    return snapshot.nodes
      .filter((node) => node.type === 'user' && personsConnectedToTopics.has(node.id))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
  }, [snapshot, personsConnectedToTopics])

  // Build topic-user relationships
  const topicUserRelations = useMemo(() => {
    if (!snapshot) return new Map<string, Array<{ user: string; weight: number }>>()
    const relations = new Map<string, Array<{ user: string; weight: number }>>()
    snapshot.topics.forEach((topic) => {
      const topicId = `topic:${topic.topic}`
      const relatedUsers: Array<{ user: string; weight: number }> = []
      snapshot.edges.forEach((edge) => {
        if (edge.target === topicId && edge.source.startsWith('user:')) {
          const username = edge.source.replace('user:', '')
          relatedUsers.push({ user: username, weight: edge.weight })
        }
      })
      if (relatedUsers.length > 0) {
        relations.set(topic.topic, relatedUsers.sort((a, b) => b.weight - a.weight))
      }
    })
    return relations
  }, [snapshot])

  // Build person-topic and person-person relationships
  type PersonRelation = {
    topics: Array<{ topic: string; weight: number }>
    persons: Array<{ person: string; weight: number }>
  }
  const personRelations = useMemo(() => {
    if (!snapshot) return new Map<string, PersonRelation>()
    const relations = new Map<string, PersonRelation>()
    const users = snapshot.nodes.filter(
      (node) => node.type === 'user' && personsConnectedToTopics.has(node.id)
    )
    users.forEach((user) => {
      const userId = user.id
      const relatedTopics: Array<{ topic: string; weight: number }> = []
      const relatedPersons: Array<{ person: string; weight: number }> = []
      snapshot.edges.forEach((edge) => {
        if (edge.source === userId) {
          if (edge.target.startsWith('topic:')) {
            const topicName = edge.target.replace('topic:', '')
            relatedTopics.push({ topic: topicName, weight: edge.weight })
          } else if (edge.target.startsWith('user:')) {
            const personName = edge.target.replace('user:', '')
            relatedPersons.push({ person: personName, weight: edge.weight })
          }
        }
      })
      if (relatedTopics.length > 0 || relatedPersons.length > 0) {
        relations.set(user.label, {
          topics: relatedTopics.sort((a, b) => b.weight - a.weight),
          persons: relatedPersons.sort((a, b) => b.weight - a.weight),
        })
      }
    })
    return relations
  }, [snapshot, personsConnectedToTopics])

  return (
    <div className="app-shell public-shell">
      <header className="app-header">
        <div>
          <h1>Twitter Insights Visualization</h1>
          <p>Historical analysis and trends</p>
        </div>
      </header>
      <div className="app-body public-body">
        <aside className="sidebar public-sidebar">
          <h2>Analysis History</h2>
          <div className="form-group">
            <label style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>
              Business Line
            </label>
            <select
              className="input"
              value={selectedBusinessLineId || ''}
              onChange={(e) => {
                setSelectedBusinessLineId(e.target.value || null)
                setSelectedSnapshotId(null)
              }}
            >
              <option value="">All Business Lines</option>
              {businessLines.map((bl) => (
                <option key={bl.id} value={bl.id}>
                  {bl.name}
                </option>
              ))}
            </select>
          </div>
          <div className="divider" />
          <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            <ul className="line-list">
              {snapshotsQuery.data?.map((s) => (
                <li
                  key={s.id}
                  className={`line-item ${s.id === selectedSnapshotId ? 'active' : ''}`}
                >
                  <button type="button" onClick={() => setSelectedSnapshotId(s.id)}>
                    <strong>
                      {s.business_line_name || 'Unknown'} -{' '}
                      {new Date(s.analysis_date).toLocaleDateString()}
                    </strong>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                      {new Date(s.analysis_date).toLocaleString()}
                    </p>
                    {s.raw_data_summary && (
                      <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                        {s.raw_data_summary}
                      </p>
                    )}
                  </button>
                </li>
              ))}
              {!snapshotsQuery.data?.length && (
                <p className="empty-state">No snapshots available.</p>
              )}
            </ul>
          </div>
        </aside>
        <main className="dashboard public-dashboard">
          {snapshotQuery.isLoading ? (
            <div className="panel">
              <p className="empty-state">Loading...</p>
            </div>
          ) : snapshot ? (
            <div className="panel public-panel topic-view-panel">
              <div className="panel-header">
                <div>
                  <h3>Topic & Key Person Network</h3>
                  <p className="panel-description">
                    Key topics, influential users, and their relationships
                  </p>
                </div>
                <span className="panel-subtitle">
                  {snapshot.business_line_name} -{' '}
                  {new Date(snapshot.analysis_date).toLocaleDateString()}
                </span>
              </div>
              <div className="public-view-layout-single">
                <div className="public-graph-main-full">
                  <Graph
                    nodes={graphNodes}
                    edges={graphEdges}
                    topicScoreMap={topicScoreMap}
                    personTopicConnectionCount={personTopicConnectionCount}
                    highlightedNodeId={highlightedNodeId}
                    onNodeClick={(nodeId) => {
                      if (nodeId) {
                        const node = snapshot.nodes.find((n) => n.id === nodeId)
                        if (node) {
                          setHighlightedNodeId(nodeId)
                          setSelectedNodeForTweets({
                            id: nodeId,
                            label: node.label,
                            type: node.type as 'user' | 'topic',
                          })
                        }
                      } else {
                        setHighlightedNodeId(null)
                      }
                    }}
                  />
                  <div className="graph-legend">
                    <div className="legend-item">
                      <span className="legend-dot legend-topic"></span>
                      <span>Topic</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-dot legend-user"></span>
                      <span>User</span>
                    </div>
                  </div>
                </div>
                <div className="public-details-container">
                  <div className="public-details-section">
                    <h4 className="details-title">Key Topics</h4>
                    <div className="details-content">
                      {topTopics.length > 0 ? (
                        topTopics.map((topic) => {
                          const relatedUsers = topicUserRelations.get(topic.topic) || []
                          return (
                            <div
                              key={topic.topic}
                              className={`topic-detail-card ${
                                highlightedNodeId === `topic:${topic.topic}` ? 'highlighted' : ''
                              }`}
                              onMouseEnter={() => setHighlightedNodeId(`topic:${topic.topic}`)}
                              onMouseLeave={() => setHighlightedNodeId(null)}
                            >
                              <div className="topic-detail-header">
                                <strong className="topic-detail-title">{topic.topic}</strong>
                                <div className="topic-detail-meta">
                                  {topic.sentiment && (
                                    <span className={`badge badge-small badge-sentiment badge-${topic.sentiment}`}>
                                      {topic.sentiment}
                                    </span>
                                  )}
                                  <span className="badge badge-small">Score {topic.score.toFixed(1)}</span>
                                </div>
                              </div>
                              <p className="topic-detail-summary">{topic.summary}</p>
                              {relatedUsers.length > 0 && (
                                <div className="related-items">
                                  <div className="related-label">Related Users:</div>
                                  <div className="related-tags">
                                    {relatedUsers.slice(0, 4).map((rel) => (
                                      <span
                                        key={rel.user}
                                        className="related-tag"
                                        onMouseEnter={() => setHighlightedNodeId(`user:${rel.user}`)}
                                        onMouseLeave={() => setHighlightedNodeId(null)}
                                      >
                                        @{rel.user}
                                        <span className="tag-weight">({rel.weight.toFixed(1)})</span>
                                      </span>
                                    ))}
                                    {relatedUsers.length > 4 && (
                                      <span className="related-tag more">
                                        +{relatedUsers.length - 4} more
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })
                      ) : (
                        <p className="empty-state">No topics available.</p>
                      )}
                    </div>
                  </div>
                  <div className="public-details-section">
                    <h4 className="details-title">Key Persons</h4>
                    <div className="details-content">
                      {topKeyPersons.length > 0 ? (
                        topKeyPersons.map((person) => {
                          const relations = personRelations.get(person.label) || { topics: [], persons: [] }
                          return (
                            <div
                              key={person.id}
                              className={`person-detail-card ${
                                highlightedNodeId === person.id ? 'highlighted' : ''
                              }`}
                              onMouseEnter={() => setHighlightedNodeId(person.id)}
                              onMouseLeave={() => setHighlightedNodeId(null)}
                            >
                              <div className="person-detail-header">
                                <strong className="person-detail-name">@{person.label}</strong>
                                <span className="badge badge-small">
                                  {person.weight.toFixed(0)} interactions
                                </span>
                              </div>
                              {relations.topics.length > 0 && (
                                <div className="related-items">
                                  <div className="related-label">Topics:</div>
                                  <div className="related-tags">
                                    {relations.topics.slice(0, 3).map((rel) => (
                                      <span
                                        key={rel.topic}
                                        className="related-tag topic-tag"
                                        onMouseEnter={() =>
                                          setHighlightedNodeId(`topic:${rel.topic}`)
                                        }
                                        onMouseLeave={() => setHighlightedNodeId(null)}
                                      >
                                        {rel.topic}
                                        <span className="tag-weight">({rel.weight.toFixed(1)})</span>
                                      </span>
                                    ))}
                                    {relations.topics.length > 3 && (
                                      <span className="related-tag more">
                                        +{relations.topics.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                              {relations.persons.length > 0 && (
                                <div className="related-items">
                                  <div className="related-label">Connections:</div>
                                  <div className="related-tags">
                                    {relations.persons.slice(0, 3).map((rel) => (
                                      <span
                                        key={rel.person}
                                        className="related-tag"
                                        onMouseEnter={() => setHighlightedNodeId(`user:${rel.person}`)}
                                        onMouseLeave={() => setHighlightedNodeId(null)}
                                      >
                                        @{rel.person}
                                        <span className="tag-weight">({rel.weight.toFixed(1)})</span>
                                      </span>
                                    ))}
                                    {relations.persons.length > 3 && (
                                      <span className="related-tag more">
                                        +{relations.persons.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })
                      ) : (
                        <p className="empty-state">No key people available.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel">
              <p className="empty-state">Select a snapshot to view analysis.</p>
            </div>
          )}
        </main>
      </div>
      {selectedNodeForTweets && snapshot && (
        <TweetModal
          snapshotId={snapshot.id}
          nodeId={selectedNodeForTweets.id}
          nodeLabel={selectedNodeForTweets.label}
          nodeType={selectedNodeForTweets.type}
          onClose={() => setSelectedNodeForTweets(null)}
        />
      )}
    </div>
  )
}
