import { useState, useMemo } from 'react'

import type { Member, MemberCreate } from '../lib/api'

type SortOrder = 'none' | 'high-to-low' | 'low-to-high'

interface MemberListProps {
  members: Member[]
  selectedMemberId: string | null
  onSelect: (member: Member) => void
  onCreate: (payload: MemberCreate) => void
  onUpdate: (memberId: string, description: string) => void
  onDelete: (memberId: string) => void
  onUpdateCount: (memberId: string) => Promise<void>
  onUpdateAllCounts: () => Promise<void>
  isBusy: boolean
}

export const MemberList = ({
  members,
  selectedMemberId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onUpdateCount,
  onUpdateAllCounts,
  isBusy,
}: MemberListProps) => {
  const [newMember, setNewMember] = useState({ twitter_id: '', description: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('none')
  const [updatingCountId, setUpdatingCountId] = useState<string | null>(null)
  const [updatingAllCounts, setUpdatingAllCounts] = useState(false)

  const sortedMembers = useMemo(() => {
    if (sortOrder === 'none') return members
    const sorted = [...members].sort((a, b) => {
      const countA = a.tweet_count ?? 0
      const countB = b.tweet_count ?? 0
      return sortOrder === 'high-to-low' ? countB - countA : countA - countB
    })
    return sorted
  }, [members, sortOrder])

  const handleCreate = () => {
    if (!newMember.twitter_id.trim()) return
    onCreate({
      twitter_id: newMember.twitter_id.trim(),
      description: newMember.description.trim() || null,
    })
    setNewMember({ twitter_id: '', description: '' })
  }

  const startEdit = (member: Member) => {
    setEditingId(member.id)
    setEditDescription(member.description || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDescription('')
  }

  const handleUpdate = (memberId: string) => {
    // Allow empty description - trim and pass empty string, which will be converted to null
    onUpdate(memberId, editDescription.trim())
    cancelEdit()
  }

  const handleUpdateCount = async (memberId: string) => {
    setUpdatingCountId(memberId)
    try {
      await onUpdateCount(memberId)
    } finally {
      setUpdatingCountId(null)
    }
  }

  const handleUpdateAllCounts = async () => {
    setUpdatingAllCounts(true)
    try {
      await onUpdateAllCounts()
    } finally {
      setUpdatingAllCounts(false)
    }
  }

  return (
    <div className="member-list-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Twitter Users</h3>
        <button
          className="small-button"
          type="button"
          onClick={handleUpdateAllCounts}
          disabled={isBusy || updatingAllCounts}
          title="Update all tweet counts"
        >
          {updatingAllCounts ? 'Updating...' : 'Update All'}
        </button>
      </div>

      {/* Add New User - moved to top */}
      <div className="form-group" style={{ marginBottom: '12px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#94a3b8' }}>Add New User</h4>
        <input
          className="input"
          placeholder="Twitter ID (e.g., username)"
          value={newMember.twitter_id}
          onChange={(e) => setNewMember((prev) => ({ ...prev, twitter_id: e.target.value }))}
        />
        <textarea
          className="textarea"
          placeholder="Description (optional, for LLM context)"
          value={newMember.description}
          onChange={(e) => setNewMember((prev) => ({ ...prev, description: e.target.value }))}
          rows={2}
        />
        <button
          className="primary-button"
          type="button"
          onClick={handleCreate}
          disabled={isBusy || !newMember.twitter_id.trim()}
        >
          Add User
        </button>
      </div>

      <div className="divider" />

      <div className="form-group" style={{ marginBottom: '12px' }}>
        <select
          className="input"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          style={{ fontSize: '0.85rem', padding: '6px 8px' }}
        >
          <option value="none">Sort by...</option>
          <option value="high-to-low">Count: High to Low</option>
          <option value="low-to-high">Count: Low to High</option>
        </select>
      </div>
      <div className="member-list">
        {sortedMembers.map((member) => (
          <div
            key={member.id}
            className={`member-item ${member.id === selectedMemberId ? 'active' : ''}`}
          >
            {editingId === member.id ? (
              <div className="member-edit">
                <input
                  className="input"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Description for LLM context"
                />
                <div className="member-actions">
                  <button
                    className="small-button"
                    type="button"
                    onClick={() => handleUpdate(member.id)}
                    disabled={isBusy}
                  >
                    Save
                  </button>
                  <button
                    className="small-button link-button"
                    type="button"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="member-select-button"
                  onClick={() => onSelect(member)}
                >
                  <div>
                    <strong>@{member.twitter_id}</strong>
                    {member.description && (
                      <p className="member-description">{member.description}</p>
                    )}
                    <span className="badge" style={{ marginTop: '4px' }}>
                      {member.tweet_count ?? 0} tweets
                    </span>
                  </div>
                </button>
                <div className="member-actions">
                  <button
                    className="small-button link-button"
                    type="button"
                    onClick={() => handleUpdateCount(member.id)}
                    disabled={isBusy || updatingCountId === member.id}
                    title="Update tweet count"
                  >
                    {updatingCountId === member.id ? '...' : 'Update'}
                  </button>
                  <button
                    className="small-button link-button"
                    type="button"
                    onClick={() => startEdit(member)}
                    disabled={isBusy}
                  >
                    Edit
                  </button>
                  <button
                    className="small-button link-button"
                    type="button"
                    onClick={() => onDelete(member.id)}
                    disabled={isBusy}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {!sortedMembers.length && (
          <p className="empty-state">No members yet. Add your first user.</p>
        )}
      </div>
    </div>
  )
}
