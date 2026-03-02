export interface EnkaShowAvatarInfo {
  avatarId?: number;
  level?: number;
}

export interface EnkaPlayerInfo {
  nickname?: string;
  level?: number;
  worldLevel?: number;
  signature?: string;
  profilePicture?: {
    avatarId?: number;
    id?: number;
  };
  showAvatarInfoList?: EnkaShowAvatarInfo[];
}

export interface EnkaPropMapValue {
  val?: string | number;
}

export type EnkaPropMap = Record<string, EnkaPropMapValue | undefined>;
export type EnkaFightPropMap = Record<string, number | string | undefined>;

export interface EnkaReliquaryMainstat {
  mainPropId?: string;
  statValue?: number;
}

export interface EnkaReliquarySubstat {
  appendPropId?: string;
  statValue?: number;
}

export interface EnkaWeaponStat {
  appendPropId?: string;
  statValue?: number;
}

export interface EnkaEquipFlat {
  icon?: string;
  rankLevel?: number;
  equipType?: string;
  itemType?: string;
  setId?: number | string;
  setName?: string;
  setIcon?: string;
  setNameTextMapHash?: number | string;
  reliquarySet?: {
    setId?: number | string;
    name?: string;
    icon?: string;
    setNameTextMapHash?: number | string;
  };
  reliquaryMainstat?: EnkaReliquaryMainstat;
  reliquarySubstats?: EnkaReliquarySubstat[];
  weaponStats?: EnkaWeaponStat[];
}

export interface EnkaWeapon {
  level?: number;
  affixMap?: Record<string, number | undefined>;
}

export interface EnkaReliquary {
  level?: number;
}

export interface EnkaEquip {
  itemId?: number;
  weapon?: EnkaWeapon;
  reliquary?: EnkaReliquary;
  flat?: EnkaEquipFlat;
}

export interface EnkaAvatarInfo {
  avatarId?: number;
  propMap?: EnkaPropMap;
  fightPropMap?: EnkaFightPropMap;
  equipList?: EnkaEquip[];
}

export interface EnkaUidResponse {
  uid?: string | number;
  ttl?: number;
  playerInfo?: EnkaPlayerInfo;
  avatarInfoList?: EnkaAvatarInfo[];
}

export interface EnkaPlayerSummary {
  nickname: string;
  level?: number;
  worldLevel?: number;
  signature?: string;
}

export interface EnkaWeaponSummary {
  kind: "weapon";
  id?: number;
  iconUrl?: string;
  level?: number;
  rarity?: number;
  refinement?: number;
}

export interface EnkaArtifactSummary {
  kind: "artifact";
  equipType?: string;
  level?: number;
  rarity?: number;
  iconUrl?: string;
  setId?: number;
  setName?: string;
  setIconUrl?: string;
  main?: {
    key?: string;
    value?: number;
  };
  subs?: Array<{
    key?: string;
    value?: number;
  }>;
}

export type EnkaEquipmentSummary = EnkaWeaponSummary | EnkaArtifactSummary;

export interface EnkaCharacterSummary {
  avatarId?: number;
  level?: number;
  weapon?: EnkaWeaponSummary;
  artifacts: EnkaArtifactSummary[];
  fightProps?: Record<string, number>;
}

export interface EnkaNormalizedResponse {
  uid: string;
  fetchedAt: string;
  ttlSeconds?: number;
  player: EnkaPlayerSummary;
  characters: EnkaCharacterSummary[];
  notes?: {
    showcaseMissing?: boolean;
  };
  metadata: {
    locale: string;
  };
}
