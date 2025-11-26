import axios from 'axios'

import { useAuthStore } from '../store/useAuthStore'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export const apiClient = axios.create({
  baseURL: API_BASE,
})

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export interface LoginRequest {
  username: string
  password: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface BusinessLine {
  id: string
  name: string
  description?: string | null
  members: string[]
  created_at: string
  updated_at: string
}

export interface TweetRecord {
  id: string
  author: string
  username: string
  content: string
  created_at: string
  image?: string | null
  language?: string | null
  like_count?: number
  retweet_count?: number
  is_quoted: boolean
  is_reply: boolean
  is_retweet: boolean
  original_author?: string | null
  original_content?: string | null
  original_id?: string | null
  original_conversationId?: string | null
  url?: string | null
  business_line?: string | null
}

export interface TweetListResponse {
  total: number
  records: TweetRecord[]
}

export interface GraphNode {
  id: string
  label: string
  type: string
  weight: number
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
}

export interface TopicSummary {
  topic: string
  summary: string
  score: number
}

export interface InsightsResponse {
  topics: TopicSummary[]
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const login = async (payload: LoginRequest) => {
  const { data } = await apiClient.post<TokenResponse>('/api/auth/token', payload)
  return data
}

export const fetchBusinessLines = async () => {
  const { data } = await apiClient.get<BusinessLine[]>('/api/biz/')
  return data
}

export interface BusinessLinePayload {
  id?: string
  name?: string
  description?: string | null
  members?: string[]
}

export const saveBusinessLine = async (payload: BusinessLinePayload) => {
  if (payload.id) {
    const { data } = await apiClient.put<BusinessLine>(`/api/biz/${payload.id}`, payload)
    return data
  }
  const { data } = await apiClient.post<BusinessLine>('/api/biz/', payload)
  return data
}

export const deleteBusinessLine = async (id: string) => {
  await apiClient.delete(`/api/biz/${id}`)
}

export const fetchTweets = async (lineId: string) => {
  const { data } = await apiClient.get<TweetListResponse>('/api/tweets/', {
    params: { line_id: lineId, hours: 24 },
  })
  return data
}

export const fetchInsights = async (lineId: string) => {
  const { data } = await apiClient.get<InsightsResponse>('/api/insights/', {
    params: { line_id: lineId, hours: 24 },
  })
  return data
}

// Member management
export interface Member {
  id: string
  twitter_id: string
  description?: string | null
  business_line_id: string
  tweet_count?: number
  created_at: string
  updated_at: string
}

export interface MemberCreate {
  twitter_id: string
  description?: string | null
}

export interface MemberUpdate {
  description?: string | null
}

export const fetchMembers = async (lineId: string) => {
  const { data } = await apiClient.get<Member[]>(`/api/biz/${lineId}/members`)
  return data
}

export const createMember = async (lineId: string, payload: MemberCreate) => {
  const { data } = await apiClient.post<Member>(`/api/biz/${lineId}/members`, payload)
  return data
}

export const updateMember = async (memberId: string, payload: MemberUpdate) => {
  const { data } = await apiClient.put<Member>(`/api/biz/members/${memberId}`, payload)
  return data
}

export const deleteMember = async (memberId: string) => {
  await apiClient.delete(`/api/biz/members/${memberId}`)
}

export const updateMemberTweetCount = async (memberId: string) => {
  const { data } = await apiClient.post<Member>(`/api/biz/members/${memberId}/update-count`)
  return data
}

export const updateAllMembersTweetCount = async (lineId: string) => {
  const { data } = await apiClient.post<{ updated: number }>(
    `/api/biz/${lineId}/members/update-all-counts`
  )
  return data
}

// User tweets
export const fetchUserTweets = async (
  twitterId: string,
  options?: {
    hours?: number | null
    skip?: number
    limit?: number
    tweet_type?: 'tweet' | 'retweet' | 'reply' | 'quote'
  },
) => {
  const params: Record<string, number | string> = {}
  if (options?.hours && options.hours > 0) {
    params.hours = options.hours
  }
  if (typeof options?.skip === 'number') {
    params.skip = options.skip
  }
  if (typeof options?.limit === 'number') {
    params.limit = options.limit
  }
  if (options?.tweet_type) {
    params.tweet_type = options.tweet_type
  }
  const { data } = await apiClient.get<TweetListResponse>(`/api/tweets/user/${twitterId}`, {
    params,
  })
  return data
}

// Analysis trigger
export interface InsightSnapshot {
  id: string
  business_line_id: string
  business_line_name?: string | null
  analysis_date: string
  topics: TopicSummary[]
  nodes: GraphNode[]
  edges: GraphEdge[]
  raw_data_summary?: string | null
  created_at: string
}

export const triggerAnalysis = async (lineId: string, hours: number = 24) => {
  const { data } = await apiClient.post<InsightSnapshot>(`/api/insights/generate/${lineId}`, null, {
    params: { hours },
  })
  return data
}

// Public endpoints (no auth required)
export const publicApiClient = axios.create({
  baseURL: API_BASE,
})

export const fetchPublicSnapshots = async (params?: {
  business_line_id?: string
  start_date?: string
  end_date?: string
  limit?: number
}) => {
  const { data } = await publicApiClient.get<InsightSnapshot[]>('/api/public/insights/snapshots', {
    params,
  })
  return data
}

export const fetchPublicSnapshot = async (snapshotId: string) => {
  const { data } = await publicApiClient.get<InsightSnapshot>(
    `/api/public/insights/snapshots/${snapshotId}`
  )
  return data
}

export const fetchLatestSnapshot = async (businessLineId?: string) => {
  const { data } = await publicApiClient.get<InsightSnapshot | null>(
    '/api/public/insights/snapshots/latest',
    {
      params: businessLineId ? { business_line_id: businessLineId } : {},
    }
  )
  return data
}

export interface RelatedTweet {
  id: string
  author: string
  username: string
  content: string
  created_at: string
  image?: string
  language?: string
  like_count: number
  retweet_count: number
  is_quoted: boolean
  is_reply: boolean
  is_retweet: boolean
  original_author?: string
  original_content?: string
  original_id?: string
  url?: string
}

export const fetchSnapshotRelatedTweets = async (
  snapshotId: string,
  nodeId: string,
  limit: number = 20
) => {
  const { data } = await publicApiClient.get<RelatedTweet[]>(
    `/api/public/insights/snapshots/${snapshotId}/tweets`,
    {
      params: { node_id: nodeId, limit },
    }
  )
  return data
}

