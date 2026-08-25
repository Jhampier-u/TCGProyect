/**
 * @tcg/shared — contrato de dominio compartido entre la API y el frontend.
 *
 * Este paquete es la razon por la que ADR-001 eligio Node + TypeScript: los tres
 * juegos tienen perfiles de datos muy distintos y tenerlos definidos una sola vez,
 * consumidos por backend y frontend, elimina toda una clase de bugs de contrato.
 *
 * No debe contener logica de negocio ni dependencias de runtime. Solo tipos y
 * funciones puras de normalizacion.
 */

export {
  GAME_IDS,
  GAME_CODES,
  GAME_NAMES,
  GAME_SOURCE_API,
  gameIdOf,
  isGameCode,
} from './game.js';
export type { GameCode, GameId } from './game.js';

export type {
  MtgColor,
  MtgGameData,
  YgoGameData,
  YgoBanlistInfo,
  PtcgGameData,
  PtcgAttack,
  PtcgWeakness,
  GameData,
  GameDataByGame,
} from './game-data.js';

export type {
  DomainSet,
  DomainCard,
  DomainPrint,
  RarityWeight,
  PackSlotSpec,
  PackTemplateSpec,
} from './domain.js';

export type {
  GameAdapter,
  IngestWarning,
  IngestWarningCode,
  IngestWarningSink,
} from './adapter.js';

export {
  RARITY_CODE_MAX_LENGTH,
  FALLBACK_RARITY_CODE,
  normalizeRarityCode,
  normalizeOracleKeyFromName,
  toJsonNumber,
  toStringArray,
  stripUndefined,
} from './normalize.js';
