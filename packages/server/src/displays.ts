/** Nextion displays a project can target. Pure data, shared with the web UI. */

export interface DisplayModel {
  /** Model as Nextion Editor names it and as the display reports it, e.g. NX4827P043_011. */
  model: string;
  /** Series name Nextion Editor expects in the project settings. */
  series: "Basic" | "Discovery" | "Enhanced" | "Intelligent";
  width: number;
  height: number;
  /** Diagonal in inches. */
  inches: number;
}

const d = (series: DisplayModel["series"], model: string, width: number, height: number, inches: number): DisplayModel => ({ series, model, width, height, inches });

export const DISPLAYS: DisplayModel[] = [
  d("Intelligent", "NX4827P043_011", 480, 272, 4.3),
  d("Intelligent", "NX8048P050_011", 800, 480, 5),
  d("Intelligent", "NX8048P070_011", 800, 480, 7),
  d("Intelligent", "NX1060P070_011", 1024, 600, 7),
  d("Intelligent", "NX1060P101_011", 1024, 600, 10.1),
  d("Enhanced", "NX3224K024_011", 320, 240, 2.4),
  d("Enhanced", "NX3224K028_011", 320, 240, 2.8),
  d("Enhanced", "NX4024K032_011", 400, 240, 3.2),
  d("Enhanced", "NX4832K035_011", 480, 320, 3.5),
  d("Enhanced", "NX4827K043_011", 480, 272, 4.3),
  d("Enhanced", "NX8048K050_011", 800, 480, 5),
  d("Enhanced", "NX8048K070_011", 800, 480, 7),
  d("Discovery", "NX3224F024_011", 320, 240, 2.4),
  d("Discovery", "NX3224F028_011", 320, 240, 2.8),
  d("Discovery", "NX4832F035_011", 480, 320, 3.5),
  d("Basic", "NX3224T024_011", 320, 240, 2.4),
  d("Basic", "NX3224T028_011", 320, 240, 2.8),
  d("Basic", "NX4024T032_011", 400, 240, 3.2),
  d("Basic", "NX4832T035_011", 480, 320, 3.5),
  d("Basic", "NX4827T043_011", 480, 272, 4.3),
  d("Basic", "NX8048T050_011", 800, 480, 5),
  d("Basic", "NX8048T070_011", 800, 480, 7),
];

export const displayByModel = (model: string) => DISPLAYS.find((x) => x.model === model);

/**
 * The catalogue entry for what a display reports about itself. A display reports its model with a
 * touch suffix (NX4827P043_011R), so the catalogue name is a prefix of it.
 */
export const displayByReported = (reported: string) => DISPLAYS.find((x) => reported.startsWith(x.model));
