import { ActionContext } from 'vuex'
import { MessageThread } from '~/models/message-thread'
import { Message } from '~/models/message'
import { Heartbeat } from '~/models/heartbeat'
import axios from '~/plugins/axios'
import { Phone } from '~/models/phone'
import { User } from '~/models/user'

const defaultNotificationTimeout = 3000

type NotificationType = 'error' | 'success' | 'info'

export interface Notification {
  message: string
  timeout: number
  active: boolean
  type: NotificationType
}

export interface NotificationRequest {
  message: string
  type: NotificationType
}

export type AuthUser = {
  id: string
}

export type State = {
  owner: string | null
  loadingThreads: boolean
  loadingMessages: boolean
  authUser: AuthUser | null
  user: User | null
  phones: Array<Phone>
  threads: Array<MessageThread>
  threadId: string | null
  heartbeat: null | Heartbeat
  pooling: boolean
  notification: Notification
  threadMessages: Array<Message>
}

export const state = (): State => ({
  threads: [],
  threadId: null,
  heartbeat: null,
  loadingThreads: true,
  loadingMessages: true,
  pooling: false,
  threadMessages: [],
  phones: [],
  user: null,
  owner: null,
  authUser: null,
  notification: {
    active: false,
    message: '',
    type: 'success',
    timeout: defaultNotificationTimeout,
  },
})

export type AppData = {
  url: string
  name: string
  appDownloadUrl: string
  documentationUrl: string
  githubUrl: string
}

export const getters = {
  getThreads(state: State): Array<MessageThread> {
    return state.threads
  },

  getAppData(): AppData {
    let url = process.env.APP_URL as string
    if (url.length > 0 && url[url.length - 1] === '/') {
      url = url.substring(0, url.length - 1)
    }
    return {
      url,
      appDownloadUrl: process.env.APP_DOWNLOAD_URL as string,
      documentationUrl: process.env.APP_DOCUMENTATION_URL as string,
      githubUrl: process.env.APP_GITHUB_URL as string,
      name: process.env.APP_NAME as string,
    }
  },

  hasThreadId: (state: State) => (threadId: string) => {
    return state.threads.find((x) => x.id === threadId) !== undefined
  },

  getAuthUser(state: State): AuthUser | null {
    return state.authUser
  },

  getUser(state: State): User | null {
    return state.user
  },

  getOwner(state: State): string | null {
    return state.owner
  },

  getActivePhone(state: State): Phone | null {
    return (
      state.phones.find((x: Phone) => {
        return x.phone_number === state.owner
      }) ?? null
    )
  },

  getPhones(state: State): Array<Phone> {
    return state.phones
  },

  hasThread(state: State): boolean {
    return state.threadId != null && !state.loadingThreads
  },

  getLoadingThreads(state: State): boolean {
    return state.loadingThreads
  },

  getLoadingMessages(state: State): boolean {
    return state.loadingMessages
  },

  getThreadMessages(state: State): Array<Message> {
    return state.threadMessages
  },

  getThread(state: State): MessageThread {
    const thread = state.threads.find((x) => x.id === state.threadId)
    if (thread === undefined) {
      throw new Error(`cannot find thread with id ${state.threadId}`)
    }
    return thread
  },

  getHeartbeat(state: State): Heartbeat | null {
    return state.heartbeat
  },

  getPolling(state: State): boolean {
    return state.pooling
  },

  getNotification(state: State): Notification {
    return state.notification
  },
}

export const mutations = {
  setThreads(state: State, payload: Array<MessageThread>) {
    state.threads = [...payload]
    state.loadingThreads = false
  },
  setThreadId(state: State, payload: string | null) {
    state.threadId = payload
  },
  setThreadMessages(state: State, payload: Array<Message>) {
    state.threadMessages = payload
    state.loadingMessages = false
  },
  setHeartbeat(state: State, payload: Heartbeat | null) {
    state.heartbeat = payload
  },
  setPooling(state: State, payload: boolean) {
    state.pooling = payload
  },
  setAuthUser(state: State, payload: AuthUser | null) {
    state.authUser = payload
  },
  setNotification(state: State, notification: NotificationRequest) {
    state.notification = {
      ...state.notification,
      active: true,
      message: notification.message,
      type: notification.type,
      timeout: Math.floor(Math.random() * 100) + defaultNotificationTimeout, // Reset the timeout
    }
  },
  disableNotification(state: State) {
    state.notification.active = false
  },
  setPhones(state: State, payload: Array<Phone>) {
    state.phones = payload

    const owner = payload.find((x) => x.phone_number === state.owner)
    if (!owner && state.phones.length > 0) {
      state.owner = state.phones[0].phone_number
    }
  },
  setUser(state: State, payload: User | null) {
    state.user = payload
  },

  setOwner(state: State, payload: string) {
    state.owner = payload
    state.loadingThreads = true
    state.loadingMessages = true
  },
}

export type SendMessageRequest = {
  from: string
  to: string
  content: string
}

export const actions = {
  async loadThreads(context: ActionContext<State, State>) {
    if (context.getters.getOwner === null) {
      await context.commit('setThreads', [])
      return
    }

    const response = await axios.get('/v1/message-threads', {
      params: {
        owner: context.getters.getOwner,
      },
    })
    await context.commit('setThreads', response.data.data)
  },

  async loadPhones(context: ActionContext<State, State>, force: boolean) {
    if (context.getters.getPhones.length > 0 && !force) {
      return
    }
    const response = await axios.get('/v1/phones', { params: { limit: 100 } })
    context.commit('setPhones', response.data.data)
  },

  async loadUser(context: ActionContext<State, State>) {
    const response = await axios.get('/v1/users/me')
    context.commit('setUser', response.data.data)
  },

  async getHeartbeat(context: ActionContext<State, State>) {
    const response = await axios.get('/v1/heartbeats', {
      params: {
        limit: 1,
        owner: context.getters.getOwner,
      },
    })

    if (response.data.data.length > 0) {
      context.commit('setHeartbeat', response.data.data[0])
      return
    }

    context.commit('setHeartbeat', null)
  },

  setPolling(context: ActionContext<State, State>, status: boolean) {
    context.commit('setPooling', status)
  },

  async sendMessage(
    context: ActionContext<State, State>,
    request: SendMessageRequest
  ) {
    await axios.post('/v1/messages/send', request)
    await Promise.all([
      context.dispatch('loadThreadMessages', context.getters.getThread.id),
      context.dispatch('loadThreads'),
    ])
  },

  setThreadId(context: ActionContext<State, State>, threadId: string | null) {
    context.commit('setThreadId', threadId)
  },

  addNotification(
    context: ActionContext<State, State>,
    request: NotificationRequest
  ) {
    context.commit('setNotification', request)
  },

  disableNotification(context: ActionContext<State, State>) {
    context.commit('disableNotification')
  },

  async loadThreadMessages(
    context: ActionContext<State, State>,
    threadId: string | null
  ) {
    await context.commit('setThreadId', threadId)
    const response = await axios.get('/v1/messages', {
      params: {
        contact: context.getters.getThread.contact,
        owner: context.getters.getThread.owner,
      },
    })
    context.commit('setThreadMessages', response.data.data)
  },

  async setAuthUser(
    context: ActionContext<State, State>,
    user: AuthUser | null
  ) {
    const userChanged = user?.id !== context.getters.getAuthUser?.id

    await context.commit('setAuthUser', user)

    if (userChanged && user !== null) {
      await Promise.all([
        context.dispatch('loadUser'),
        context.dispatch('loadPhones'),
      ])

      const phone = context.getters.getPhones.find(
        (x: Phone) => x.id === context.getters.getUser.active_phone_id
      )
      if (phone) {
        await context.dispatch('setOwner', phone.phone_number)
      }
    }
  },

  async setOwner(context: ActionContext<State, State>, owner: string) {
    await context.commit('setOwner', owner)

    const phone = context.getters.getActivePhone as Phone | null
    if (!phone) {
      return
    }

    const response = await axios.put('/v1/users/me', {
      active_phone_id: phone.id,
    })

    context.commit('setUser', response.data.data)
  },
}
