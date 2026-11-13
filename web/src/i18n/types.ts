export type Language = 'zh-CN' | 'en';
export type Translation = string | {one: string; other: string};
export type Messages = Record<string, Translation>;
export type Values = Record<string, string | number>;
