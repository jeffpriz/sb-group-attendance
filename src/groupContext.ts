import { useOutletContext } from 'react-router'
import type { Group, SeasonSummary } from '../shared/types.ts'

export interface GroupContext {
  group: Group
  /** Replace the group with the latest copy returned by the server. */
  setGroup: (group: Group) => void
  seasons?: SeasonSummary[]
  seasonsLoading: boolean
  seasonsError?: string
  retrySeasons: () => void
}

export function useGroup(): GroupContext {
  return useOutletContext<GroupContext>()
}
