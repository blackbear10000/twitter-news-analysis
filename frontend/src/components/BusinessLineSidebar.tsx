import { useState } from 'react'

import type { BusinessLine } from '../lib/api'

interface BusinessLineSidebarProps {
  lines: BusinessLine[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (payload: { name: string; description?: string; members: string[] }) => void
  onDelete: (id: string) => void
  isBusy: boolean
}

export const BusinessLineSidebar = ({
  lines,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  isBusy,
}: BusinessLineSidebarProps) => {
  const [newLine, setNewLine] = useState({ name: '', description: '', members: '' })
  const [isCreateFormCollapsed, setIsCreateFormCollapsed] = useState(false)
  const [isLinesListCollapsed, setIsLinesListCollapsed] = useState(false)

  const handleCreate = () => {
    if (!newLine.name.trim()) return
    const members = newLine.members
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter(Boolean)
    onCreate({ name: newLine.name.trim(), description: newLine.description.trim(), members })
    setNewLine({ name: '', description: '', members: '' })
  }

  return (
    <aside className="sidebar">
      {/* Create / Update Line - moved to top */}
      <div className="collapsible-section">
        <button
          type="button"
          className="collapsible-header"
          onClick={() => setIsCreateFormCollapsed(!isCreateFormCollapsed)}
        >
          <h2>Create / Update Line</h2>
          <span className="collapse-icon">{isCreateFormCollapsed ? '▼' : '▲'}</span>
        </button>
        {!isCreateFormCollapsed && (
          <div className="form-group">
            <input
              className="input"
              placeholder="Line name"
              value={newLine.name}
              onChange={(event) => setNewLine((prev) => ({ ...prev, name: event.target.value }))}
            />
            <textarea
              className="textarea"
              placeholder="Description"
              value={newLine.description}
              onChange={(event) =>
                setNewLine((prev) => ({ ...prev, description: event.target.value }))
              }
            />
            <textarea
              className="textarea"
              placeholder="Twitter IDs (comma or newline separated)"
              value={newLine.members}
              onChange={(event) => setNewLine((prev) => ({ ...prev, members: event.target.value }))}
            />
            <button
              className="primary-button"
              type="button"
              onClick={handleCreate}
              disabled={isBusy}
            >
              {isBusy ? 'Saving...' : 'Save Business Line'}
            </button>
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Business Lines - with collapse */}
      <div className="collapsible-section">
        <button
          type="button"
          className="collapsible-header"
          onClick={() => setIsLinesListCollapsed(!isLinesListCollapsed)}
        >
          <h2>Business Lines</h2>
          <span className="collapse-icon">{isLinesListCollapsed ? '▼' : '▲'}</span>
        </button>
        {!isLinesListCollapsed && (
          <ul className="line-list">
            {lines.map((line) => (
              <li
                key={line.id}
                className={line.id === selectedId ? 'line-item active' : 'line-item'}
              >
                <button type="button" onClick={() => onSelect(line.id)}>
                  <strong>{line.name}</strong>
                  <p>{line.description ?? 'No description'}</p>
                  <span className="badge">{line.members.length} users</span>
                </button>
                <div>
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => onDelete(line.id)}
                    disabled={isBusy}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {!lines.length && <p className="empty-state">Create your first business line.</p>}
          </ul>
        )}
      </div>
    </aside>
  )
}
