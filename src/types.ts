export interface BrandConfig {
  name: string;
  logo: string;
  city?: string;
  colors: {
    bg: string;
    surface: string;
    surface2: string;
    line: string;
    text: string;
    textMuted: string;
    accent: string;
    accentInk: string;
    stage: string;
    caliper: string;
  };
  fonts: { display: string; body: string; css?: string };
  contacts: { phone?: string; telegram?: string; whatsapp?: string; address?: string };
  leads: { workerUrl?: string; channel?: 'telegram' | 'whatsapp' };
  texts: {
    homeTitle: string;
    homeLead: string;
    thanksTitle: string;
    thanksText: string;
    watermark: string;
  };
  policyUrl?: string;
}

export interface WheelSize {
  width: number;
  et: number;
  price: number;
  stock: number;
}

export interface Wheel {
  id: string;
  name: string;
  style: string;
  color: string;
  material: string;
  pcd: string[];
  diameters: Record<string, WheelSize>;
  image: string;
  thumb: string;
  rank: number;
  /** optional per-model override of rim/tyre ratio */
  rimToTireRatio?: Record<string, number>;
}

export interface WheelCatalog {
  rimToTireRatio: Record<string, number>;
  styles: Record<string, string>;
  colors: Record<string, { label: string; swatch: string }>;
  wheels: Wheel[];
}

/** Wheel position on the photo, in image pixels. r = tyre outer radius, sx = horizontal squash (perspective) */
export interface WheelSpot {
  x: number;
  y: number;
  r: number;
  sx?: number;
}

export interface Car {
  id: string;
  name: string;
  paint?: string;
  image: string;
  thumb?: string;
  width: number;
  height: number;
  stockDiameter: number;
  /** demo studio shots have a glossy floor: new rims get mirrored below the ground line */
  floorReflection?: boolean;
  wheels: WheelSpot[];
}

export interface CarCatalog {
  cars: Car[];
}

export interface AppData {
  brand: BrandConfig;
  catalog: WheelCatalog;
  cars: Car[];
}
