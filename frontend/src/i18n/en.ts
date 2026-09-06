import type { Translations } from './tr'

const en: Translations = {
  nav: {
    dashboard:    'Dashboard',
    session:      'Session',
    followers:    'Follower Analysis',
    posts:        'Posts',
    report:       'Interaction Report',
    users:        'User Pool',
    monitor:      'Queue Monitor',
    actions:      'Action History',
  },
  common: {
    loading:      'Loading…',
    error:        'Error',
    save:         'Save',
    cancel:       'Cancel',
    confirm:      'Confirm',
    search:       'Search…',
    noData:       'No data found',
    all:          'All',
    total:        'Total',
  },
  lang: {
    tr: 'Türkçe',
    en: 'English',
  },
  users: {
    title:        'User Pool',
    tabs: {
      all:        'All',
      following:  'Following',
      followers:  'Followers',
      ghosts:     '👻 Ghosts',
    },
    sort: {
      engDesc:    'Engagement ↓ (Highest)',
      engAsc:     'Engagement ↑ (Lowest)',
      nameAsc:    'Username A → Z',
      nameDesc:   'Username Z → A',
    },
    col: {
      user:       'User',
      likes:      'Likes',
      comments:   'Comments',
      engagement: 'Rate',
      action:     'Action',
    },
    action: {
      follow:           'Follow',
      unfollow:         'Unfollow',
      removeFollower:   'Remove Follower',
      bulkFollow:       'Bulk Follow',
      bulkUnfollow:     'Bulk Unfollow',
    },
    toast: {
      followed:         (u: string) => `Following @${u}`,
      unfollowed:       (u: string) => `Unfollowed @${u}`,
      removed:          (u: string) => `Removed @${u} from followers`,
      failed:           'Request failed',
    },
    ghost: {
      badge:      'ghost',
      hint:       'Follows/follower but zero engagement',
    },
    syncAll:      'Scan All',
    exportCsv:    'Export CSV',
    selectAll:    'Select all',
    page:         'Page',
  },
  posts: {
    title:        'Posts',
    syncPosts:    'Sync Posts',
    syncAll:      'Scan All',
    syncing:      'Scanning…',
    likes:        'likes',
    comments:     'comments',
    synced:       'scanned',
  },
  report: {
    title:        'Interaction Report',
    kpi: {
      posts:          'Total Posts',
      likes:          'Total Likes',
      comments:       'Total Comments',
      avgLikes:       'Avg. Likes',
      uniqueUsers:    'Unique Interactors',
    },
    sections: {
      monthly:        'Monthly Like Trend',
      breakdown:      'Follower / Outsider Breakdown',
      topFans:        'Top Fans',
      topPosts:       'Most Liked Posts',
      topCommenters:  'Top Commenters',
    },
  },
  session: {
    title:        'Session Management',
    new:          'New Session',
    validate:     'Validate',
    status: {
      active:     'Active',
      expired:    'Expired',
      pending:    'Pending',
    },
  },
  followers: {
    title:        'Follower Analysis',
    sync:         'Sync',
    following:    'Following',
    followers:    'Followers',
    mutual:       'Mutual',
    notFollowingBack: 'Not Following Back',
    notFollowedBack:  'Not Followed Back',
  },
}

export default en
