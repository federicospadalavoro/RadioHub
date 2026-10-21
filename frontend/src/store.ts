import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { Radio } from "./types";
import type { PlaybackStatus } from "./playback";

const player = createSlice({
  name: "player",
  initialState: {
    radio: null as Radio | null,
    request: 0,
    status: "idle" as PlaybackStatus,
    active: false,
    volume: 1,
    muted: false,
  },
  reducers: {
    loadRadio(state, action: PayloadAction<Radio | null>) {
      state.radio = action.payload;
    },
    playRadio(state, action: PayloadAction<Radio>) {
      state.radio = action.payload;
      state.active = true;
      state.status = "loading";
      state.request += 1;
    },
    toggleRequested(state) {
      state.active = !state.active;
      state.request += 1;
    },
    setPlaybackStatus(state, action: PayloadAction<PlaybackStatus>) {
      state.status = action.payload;
    },
    setPlaybackActive(state, action: PayloadAction<boolean>) {
      state.active = action.payload;
    },
    setVolume(state, action: PayloadAction<number>) {
      state.volume = action.payload;
      state.muted = false;
    },
    toggleMute(state) {
      if (state.muted || state.volume === 0) {
        state.muted = false;
        if (state.volume === 0) state.volume = 1;
      } else state.muted = true;
    },
  },
});

export const {
  loadRadio,
  playRadio,
  toggleRequested,
  setPlaybackStatus,
  setPlaybackActive,
  setVolume,
  toggleMute,
} = player.actions;
export const createAppStore = () =>
  configureStore({ reducer: { player: player.reducer } });
export const store = createAppStore();
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
