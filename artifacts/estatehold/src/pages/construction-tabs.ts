export const constructionTabs = ['plans', 'ongoing', 'completed', 'request'] as const;
export type ConstructionTab = typeof constructionTabs[number];

export function getConstructionTab(search: string): ConstructionTab {
  const value = new URLSearchParams(search).get('tab');
  return constructionTabs.includes(value as ConstructionTab) ? value as ConstructionTab : 'plans';
}

export function constructionTabUrl(tab: ConstructionTab): string {
  return `/construction?tab=${tab}`;
}
