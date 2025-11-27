import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  type BusinessLine,
  type InsightSnapshot,
  fetchBusinessLines,
  fetchPublicSnapshot,
  updateSnapshotVisibility,
} from '../lib/api'
import { apiClient } from '../lib/api'
import { useAuthStore } from '../store/useAuthStore'
import { Graph } from './Graph'
import { TweetModal } from './TweetModal'

export const ReportList = () => {
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null)
  const [selectedNodeForTweets, setSelectedNodeForTweets] = useState<{
    id: string
    label: string
    type: 'user' | 'topic'
  } | null>(null)

  const businessLinesQuery = useQuery({
    queryKey: ['business-lines'],
    queryFn: fetchBusinessLines,
    enabled: Boolean(token),
  })

  const reportsQuery = useQuery({
    queryKey: ['historical-reports', selectedLineId],
    queryFn: async () => {
      // Use admin endpoint to get all snapshots (including private ones)
      const { data } = await apiClient.get<InsightSnapshot[]>('/api/insights/reports', {
        params: { business_line_id: selectedLineId || undefined, limit: 100 },
      })
      return data
    },
    enabled: Boolean(token),
  })

  const selectedSnapshotQuery = useQuery({
    queryKey: ['snapshot', selectedSnapshotId],
    queryFn: () => fetchPublicSnapshot(selectedSnapshotId!),
    enabled: Boolean(token && selectedSnapshotId),
  })

  const deleteReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      await apiClient.delete(`/api/insights/reports/${reportId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historical-reports'] })
      queryClient.invalidateQueries({ queryKey: ['public-snapshots'] })
      if (selectedSnapshotId) {
        setSelectedSnapshotId(null)
      }
    },
  })

  const updateVisibilityMutation = useMutation({
    mutationFn: ({ reportId, isPublic }: { reportId: string; isPublic: boolean }) =>
      updateSnapshotVisibility(reportId, isPublic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historical-reports'] })
      queryClient.invalidateQueries({ queryKey: ['public-snapshots'] })
      if (selectedSnapshotId) {
        queryClient.invalidateQueries({ queryKey: ['snapshot', selectedSnapshotId] })
      }
    },
  })

  const handleDelete = async (reportId: string) => {
    if (confirm('Are you sure you want to delete this analysis?')) {
      try {
        await deleteReportMutation.mutateAsync(reportId)
      } catch (error) {
        console.error('Failed to delete analysis:', error)
        alert('Failed to delete analysis')
      }
    }
  }

  const handleToggleVisibility = async (reportId: string, currentVisibility: boolean) => {
    try {
      await updateVisibilityMutation.mutateAsync({
        reportId,
        isPublic: !currentVisibility,
      })
    } catch (error) {
      console.error('Failed to update visibility:', error)
      alert('Failed to update visibility')
    }
  }

  const reports = reportsQuery.data ?? []
  const selectedSnapshot = selectedSnapshotQuery.data

  // Get top topics (sorted by score)
  const topTopics = useMemo(() => {
    if (!selectedSnapshot) return []
    return [...selectedSnapshot.topics].sort((a, b) => b.score - a.score).slice(0, 10)
  }, [selectedSnapshot])

  // Build topic score map
  const topicScoreMap = useMemo(() => {
    if (!selectedSnapshot) return new Map<string, number>()
    const map = new Map<string, number>()
    selectedSnapshot.topics.forEach((topic) => {
      map.set(`topic:${topic.topic}`, topic.score)
    })
    return map
  }, [selectedSnapshot])

  // Get set of person IDs that are connected to at least one topic
  const personsConnectedToTopics = useMemo(() => {
    if (!selectedSnapshot) return new Set<string>()
    const connected = new Set<string>()
    selectedSnapshot.edges.forEach((edge) => {
      if (edge.source.startsWith('user:') && edge.target.startsWith('topic:')) {
        connected.add(edge.source)
      }
    })
    return connected
  }, [selectedSnapshot])

  // Count topic connections for each person
  const personTopicConnectionCount = useMemo(() => {
    if (!selectedSnapshot) return new Map<string, number>()
    const counts = new Map<string, number>()
    selectedSnapshot.edges.forEach((edge) => {
      if (edge.source.startsWith('user:') && edge.target.startsWith('topic:')) {
        const current = counts.get(edge.source) || 0
        counts.set(edge.source, current + 1)
      }
    })
    return counts
  }, [selectedSnapshot])

  // Filter nodes to only include persons connected to topics
  const filteredNodes = useMemo(() => {
    if (!selectedSnapshot) return []
    return selectedSnapshot.nodes.filter((node) => {
      if (node.type === 'topic') return true
      if (node.type === 'user') {
        return personsConnectedToTopics.has(node.id)
      }
      return true
    })
  }, [selectedSnapshot, personsConnectedToTopics])

  // Filter edges to only include those with valid nodes
  const filteredEdges = useMemo(() => {
    if (!selectedSnapshot) return []
    const validNodeIds = new Set(filteredNodes.map((n) => n.id))
    return selectedSnapshot.edges.filter(
      (edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target)
    )
  }, [selectedSnapshot, filteredNodes])

  // Get top key persons (sorted by weight) - only those connected to topics
  const topKeyPersons = useMemo(() => {
    if (!selectedSnapshot) return []
    return selectedSnapshot.nodes
      .filter((node) => node.type === 'user' && personsConnectedToTopics.has(node.id))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
  }, [selectedSnapshot, personsConnectedToTopics])

  // Build topic-user relationships
  const topicUserRelations = useMemo(() => {
    if (!selectedSnapshot) return new Map<string, Array<{ user: string; weight: number }>>()
    const relations = new Map<string, Array<{ user: string; weight: number }>>()
    selectedSnapshot.topics.forEach((topic) => {
      const topicId = `topic:${topic.topic}`
      const relatedUsers: Array<{ user: string; weight: number }> = []
      selectedSnapshot.edges.forEach((edge) => {
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
  }, [selectedSnapshot])

  // Build person-topic and person-person relationships
  type PersonRelation = {
    topics: Array<{ topic: string; weight: number }>
    persons: Array<{ person: string; weight: number }>
  }
  const personRelations = useMemo(() => {
    if (!selectedSnapshot) return new Map<string, PersonRelation>()
    const relations = new Map<string, PersonRelation>()
    const users = selectedSnapshot.nodes.filter(
      (node) => node.type === 'user' && personsConnectedToTopics.has(node.id)
    )
    users.forEach((user) => {
      const userId = user.id
      const relatedTopics: Array<{ topic: string; weight: number }> = []
      const relatedPersons: Array<{ person: string; weight: number }> = []
      selectedSnapshot.edges.forEach((edge) => {
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
  }, [selectedSnapshot, personsConnectedToTopics])

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>Analysis History</h1>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          Filter by Business Line
        </label>
        <select
          value={selectedLineId || ''}
          onChange={(e) => {
            setSelectedLineId(e.target.value || null)
            setSelectedSnapshotId(null)
          }}
          style={{
            width: '100%',
            padding: '0.5rem',
            fontSize: '1rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          <option value="">All Business Lines</option>
          {businessLinesQuery.data?.map((line) => (
            <option key={line.id} value={line.id}>
              {line.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem' }}>
        {/* Left sidebar - Analysis list */}
        <div>
          <h3 style={{ marginBottom: '1rem' }}>Analyses</h3>
          {reportsQuery.isLoading ? (
            <p>Loading analyses...</p>
          ) : reports.length === 0 ? (
            <p>No analyses found</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
              {reports.map((report) => (
                <div
                  key={report.id}
                  style={{
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    padding: '1rem',
                    backgroundColor: selectedSnapshotId === report.id ? '#e0f2fe' : '#f9fafb',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedSnapshotId(report.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                    <strong style={{ fontSize: '0.9rem' }}>
                      {report.business_line_name || 'Unknown'}
                    </strong>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: report.is_public ? '#10b981' : '#6b7280',
                        color: 'white',
                      }}
                    >
                      {report.is_public ? 'Public' : 'Private'}
                    </span>
                  </div>
                  <p style={{ margin: '0.25rem 0', color: '#666', fontSize: '0.875rem' }}>
                    {new Date(report.analysis_date).toLocaleDateString()}
                  </p>
                  {report.raw_data_summary && (
                    <p style={{ margin: '0.25rem 0', color: '#999', fontSize: '0.75rem' }}>
                      {report.raw_data_summary}
                    </p>
                  )}
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleVisibility(report.id, report.is_public || false)
                      }}
                      disabled={updateVisibilityMutation.isPending}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        backgroundColor: report.is_public ? '#f59e0b' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      {report.is_public ? 'Make Private' : 'Make Public'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(report.id)
                      }}
                      disabled={deleteReportMutation.isPending}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right side - Analysis details */}
        <div>
          {selectedSnapshotQuery.isLoading ? (
            <div className="panel">
              <p className="empty-state">Loading analysis...</p>
            </div>
          ) : selectedSnapshot ? (
            <div className="panel public-panel topic-view-panel">
              <div className="panel-header">
                <div>
                  <h3>Topic & Key Person Network</h3>
                  <p className="panel-description">
                    Key topics, influential users, and their relationships
                  </p>
                </div>
                <span className="panel-subtitle">
                  {selectedSnapshot.business_line_name} -{' '}
                  {new Date(selectedSnapshot.analysis_date).toLocaleDateString()}
                </span>
              </div>
              <div className="public-view-layout-single">
                <div className="public-graph-main-full">
                  <Graph
                    nodes={filteredNodes}
                    edges={filteredEdges}
                    topicScoreMap={topicScoreMap}
                    personTopicConnectionCount={personTopicConnectionCount}
                    highlightedNodeId={highlightedNodeId}
                    onNodeClick={(nodeId) => {
                      if (nodeId) {
                        const node = filteredNodes.find((n) => n.id === nodeId)
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
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                          const relations = personRelations.get(person.label)
                          return (
                            <div
                              key={person.id}
                              className={`topic-detail-card ${
                                highlightedNodeId === person.id ? 'highlighted' : ''
                              }`}
                              onMouseEnter={() => setHighlightedNodeId(person.id)}
                              onMouseLeave={() => setHighlightedNodeId(null)}
                            >
                              <div className="topic-detail-header">
                                <strong className="topic-detail-title">@{person.label}</strong>
                                <span className="badge badge-small">Weight {person.weight.toFixed(1)}</span>
                              </div>
                              {relations && (
                                <>
                                  {relations.topics.length > 0 && (
                                    <div className="related-items">
                                      <div className="related-label">Related Topics:</div>
                                      <div className="related-tags">
                                        {relations.topics.slice(0, 3).map((rel) => (
                                          <span
                                            key={rel.topic}
                                            className="related-tag"
                                            onMouseEnter={() => setHighlightedNodeId(`topic:${rel.topic}`)}
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
                                      <div className="related-label">Related Persons:</div>
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
                                </>
                              )}
                            </div>
                          )
                        })
                      ) : (
                        <p className="empty-state">No key persons available.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel">
              <p className="empty-state">Select an analysis to view details</p>
            </div>
          )}
        </div>
      </div>

      {selectedNodeForTweets && selectedSnapshot && (
        <TweetModal
          snapshotId={selectedSnapshot.id}
          nodeId={selectedNodeForTweets.id}
          nodeLabel={selectedNodeForTweets.label}
          nodeType={selectedNodeForTweets.type}
          onClose={() => setSelectedNodeForTweets(null)}
        />
      )}
    </div>
  )
}
