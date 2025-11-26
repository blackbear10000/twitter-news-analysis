import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import './App.css'
import { BusinessLineSidebar } from './components/BusinessLineSidebar'
import { LoginForm } from './components/LoginForm'
import { MemberList } from './components/MemberList'
import { UserTweetView } from './components/UserTweetView'
import {
  type BusinessLinePayload,
  type Member,
  type MemberCreate,
  createMember,
  deleteBusinessLine,
  deleteMember,
  fetchBusinessLines,
  fetchMembers,
  fetchUserTweets,
  saveBusinessLine,
  triggerAnalysis,
  updateMember,
  updateMemberTweetCount,
  updateAllMembersTweetCount,
} from './lib/api'
import { useAuthStore } from './store/useAuthStore'

function AdminApp() {
  const token = useAuthStore((state) => state.token)
  const selectedLineId = useAuthStore((state) => state.businessLineId)
  const setBusinessLineId = useAuthStore((state) => state.setBusinessLineId)
  const logout = useAuthStore((state) => state.logout)
  const queryClient = useQueryClient()

  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [timelineRange, setTimelineRange] = useState<'all' | '24h' | '7d' | '30d'>('all')
  const [timelineType, setTimelineType] = useState<'all' | 'tweet' | 'retweet' | 'reply' | 'quote'>('all')
  const [timelinePage, setTimelinePage] = useState(1)
  const [timelinePageSize, setTimelinePageSize] = useState(25)

  const businessLinesQuery = useQuery({
    queryKey: ['business-lines'],
    queryFn: fetchBusinessLines,
    enabled: Boolean(token),
  })

  useEffect(() => {
    const lines = businessLinesQuery.data ?? []
    if (!lines.length) {
      setBusinessLineId(null)
      return
    }
    if (!selectedLineId) {
      setBusinessLineId(lines[0].id)
      return
    }
    const exists = lines.some((line) => line.id === selectedLineId)
    if (!exists) {
      setBusinessLineId(lines[0].id)
    }
  }, [businessLinesQuery.data, selectedLineId, setBusinessLineId])

  // Reset selected member when line changes
  useEffect(() => {
    setSelectedMember(null)
    setTimelineRange('all')
    setTimelineType('all')
    setTimelinePage(1)
    setTimelinePageSize(25)
  }, [selectedLineId])

  useEffect(() => {
    if (!selectedMember) return
    setTimelineRange('all')
    setTimelineType('all')
    setTimelinePage(1)
  }, [selectedMember?.id])

  const membersQuery = useQuery({
    queryKey: ['members', selectedLineId],
    queryFn: () => fetchMembers(selectedLineId!),
    enabled: Boolean(token && selectedLineId),
  })

  const timelineHoursMap: Record<'all' | '24h' | '7d' | '30d', number | null> = {
    all: null,
    '24h': 24,
    '7d': 24 * 7,
    '30d': 24 * 30,
  }

  const userTweetsQuery = useQuery({
    queryKey: [
      'user-tweets',
      selectedMember?.twitter_id,
      timelineRange,
      timelineType,
      timelinePage,
      timelinePageSize,
    ],
    queryFn: () =>
      fetchUserTweets(selectedMember!.twitter_id, {
        hours: timelineHoursMap[timelineRange],
        skip: (timelinePage - 1) * timelinePageSize,
        limit: timelinePageSize,
        tweet_type: timelineType === 'all' ? undefined : timelineType,
      }),
    enabled: Boolean(token && selectedMember),
    keepPreviousData: true,
  })

  const saveLineMutation = useMutation({
    mutationFn: saveBusinessLine,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-lines'] })
    },
  })

  const deleteLineMutation = useMutation({
    mutationFn: deleteBusinessLine,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-lines'] })
      setBusinessLineId(null)
    },
  })

  const createMemberMutation = useMutation({
    mutationFn: ({ lineId, payload }: { lineId: string; payload: MemberCreate }) =>
      createMember(lineId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', selectedLineId] })
    },
  })

  const updateMemberMutation = useMutation({
    mutationFn: ({ memberId, description }: { memberId: string; description: string }) =>
      updateMember(memberId, { description: description.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', selectedLineId] })
      if (selectedMember) {
        queryClient.invalidateQueries({ queryKey: ['user-tweets', selectedMember.twitter_id] })
      }
    },
  })

  const deleteMemberMutation = useMutation({
    mutationFn: deleteMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', selectedLineId] })
      if (selectedMember) {
        setSelectedMember(null)
      }
    },
  })

  const triggerAnalysisMutation = useMutation({
    mutationFn: ({ lineId }: { lineId: string }) => triggerAnalysis(lineId),
    onSuccess: () => {
      alert('Analysis completed and saved as snapshot!')
    },
  })

  const handleCreateMember = (payload: MemberCreate) => {
    if (!selectedLineId) return
    createMemberMutation.mutate({ lineId: selectedLineId, payload })
  }

  const handleUpdateMember = (memberId: string, description: string) => {
    updateMemberMutation.mutate({ memberId, description })
  }

  const handleDeleteMember = (memberId: string) => {
    if (confirm('Are you sure you want to delete this member?')) {
      deleteMemberMutation.mutate(memberId)
    }
  }

  const handleTriggerAnalysis = () => {
    if (!selectedLineId) return
    if (confirm('Generate analysis snapshot for this business line?')) {
      triggerAnalysisMutation.mutate({ lineId: selectedLineId })
    }
  }

  const handleUpdateMemberCount = async (memberId: string) => {
    try {
      await updateMemberTweetCount(memberId)
      queryClient.invalidateQueries({ queryKey: ['members', selectedLineId] })
    } catch (error) {
      console.error('Failed to update member count:', error)
    }
  }

  const handleUpdateAllMembersCount = async () => {
    if (!selectedLineId) return
    try {
      await updateAllMembersTweetCount(selectedLineId)
      queryClient.invalidateQueries({ queryKey: ['members', selectedLineId] })
    } catch (error) {
      console.error('Failed to update all member counts:', error)
    }
  }

  if (!token) {
    return (
      <main className="login-layout">
        <LoginForm />
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Twitter Observation Management</h1>
          <p>Manage business lines and Twitter users</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {selectedLineId && (
            <button
              className="primary-button"
              type="button"
              onClick={handleTriggerAnalysis}
              disabled={triggerAnalysisMutation.isPending}
            >
              {triggerAnalysisMutation.isPending ? 'Generating...' : 'Generate Analysis'}
            </button>
          )}
          <button className="link-button" type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </header>
      <div className="app-body admin-layout">
        <div className="admin-left-panel">
          <BusinessLineSidebar
            lines={businessLinesQuery.data ?? []}
            selectedId={selectedLineId}
            onSelect={setBusinessLineId}
            onCreate={(payload) => saveLineMutation.mutate(payload as BusinessLinePayload)}
            onDelete={(id) => deleteLineMutation.mutate(id)}
            isBusy={saveLineMutation.isPending || deleteLineMutation.isPending}
          />
          {selectedLineId && (
            <MemberList
              members={membersQuery.data ?? []}
              selectedMemberId={selectedMember?.id || null}
              onSelect={setSelectedMember}
              onCreate={handleCreateMember}
              onUpdate={handleUpdateMember}
              onDelete={handleDeleteMember}
              onUpdateCount={handleUpdateMemberCount}
              onUpdateAllCounts={handleUpdateAllMembersCount}
              isBusy={
                createMemberMutation.isPending ||
                updateMemberMutation.isPending ||
                deleteMemberMutation.isPending
              }
            />
          )}
        </div>
        <main className="admin-main-content">
          <UserTweetView
            tweets={userTweetsQuery.data?.records ?? []}
            total={userTweetsQuery.data?.total ?? 0}
            username={selectedMember?.twitter_id}
            range={timelineRange}
            onRangeChange={(value) => {
              setTimelineRange(value)
              setTimelinePage(1)
            }}
            typeFilter={timelineType}
            onTypeFilterChange={(value) => {
              setTimelineType(value)
              setTimelinePage(1)
            }}
            page={timelinePage}
            onPageChange={setTimelinePage}
            pageSize={timelinePageSize}
            onPageSizeChange={(value) => {
              setTimelinePageSize(value)
              setTimelinePage(1)
            }}
            isLoading={userTweetsQuery.isLoading || userTweetsQuery.isFetching}
          />
        </main>
      </div>
    </div>
  )
}

export default AdminApp

