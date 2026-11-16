/** The boards a project can target. The web UI picks the flasher from `flasher`. */
export interface Board {
  id: string;
  fqbn: string;
  name: string;
  /** How the browser flashes it: UPDI over Web Serial, or Teensy HalfKay over WebHID. */
  flasher: "nano-every" | "teensy";
}

export const BOARDS: Board[] = [
  { id: "nano-every", fqbn: "arduino:megaavr:nona4809", name: "Arduino Nano Every", flasher: "nano-every" },
  { id: "teensy41", fqbn: "teensy:avr:teensy41", name: "Teensy 4.1", flasher: "teensy" },
];

export const boardById = (id: string) => BOARDS.find((b) => b.id === id);
export const boardByFqbn = (fqbn: string) => BOARDS.find((b) => b.fqbn === fqbn);
