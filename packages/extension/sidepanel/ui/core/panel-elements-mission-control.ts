type NullableElement<T extends Element> = T | null;

const byId = <T extends HTMLElement>(id: string): NullableElement<T> =>
  document.getElementById(id) as NullableElement<T>;

export const getMissionControlElements = () => ({
  quickActionsFab: byId<HTMLButtonElement>('quickActionsFab'),
  quickActionsMenu: byId<HTMLElement>('quickActionsMenu'),
  quickActionMissionControl: byId<HTMLButtonElement>('quickActionMissionControl'),
  quickActionSettings: byId<HTMLButtonElement>('quickActionSettings'),
  quickActionHistory: byId<HTMLButtonElement>('quickActionHistory'),
  quickActionNewSession: byId<HTMLButtonElement>('quickActionNewSession'),
  composerMoreBtn: byId<HTMLButtonElement>('composerMoreBtn'),
  composerMoreMenu: byId<HTMLElement>('composerMoreMenu'),
  composerActionAttachFile: byId<HTMLButtonElement>('composerActionAttachFile'),
  composerActionRecordContext: byId<HTMLButtonElement>('composerActionRecordContext'),
  composerActionSelectTabs: byId<HTMLButtonElement>('composerActionSelectTabs'),
  composerActionExport: byId<HTMLButtonElement>('composerActionExport'),
  missionControlFab: byId<HTMLButtonElement>('missionControlFab'),
  missionControlScrim: byId<HTMLElement>('missionControlScrim'),
  missionControlPanel: byId<HTMLElement>('missionControlPanel'),
  mcCloseBtn: byId<HTMLButtonElement>('mcCloseBtn'),
  mcHeaderMeta: byId<HTMLElement>('mcHeaderMeta'),
  mcAgentList: byId<HTMLElement>('mcAgentList'),
  mcDetail: byId<HTMLElement>('mcDetail'),
  mcDetailBack: byId<HTMLButtonElement>('mcDetailBack'),
  mcDetailName: byId<HTMLElement>('mcDetailName'),
  mcDetailStatusPill: byId<HTMLElement>('mcDetailStatusPill'),
  mcDetailBody: byId<HTMLElement>('mcDetailBody'),
  mcMessageInput: byId<HTMLInputElement>('mcMessageInput'),
  mcMessageSend: byId<HTMLButtonElement>('mcMessageSend'),
  mcFabBadge: byId<HTMLElement>('mcFabBadge'),
});
