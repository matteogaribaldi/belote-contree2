import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private enabled = true;
  private volume = 0.5;

  constructor() {
    this.loadSounds();
  }

  private loadSounds() {
    const soundFiles = {
      'shuffle': '/assets/sounds/shuffle.mp3',
      'playCard': '/assets/sounds/play-card.mp3',
      'winTrick': '/assets/sounds/win-trick.mp3',
      'belote': '/assets/sounds/belote.mp3',
      'bid': '/assets/sounds/bid.mp3',
      'pass': '/assets/sounds/pass.mp3',
      'victory': '/assets/sounds/victory.mp3',
      'newHand': '/assets/sounds/new-hand.mp3'
    };

    Object.entries(soundFiles).forEach(([name, path]) => {
      const audio = new Audio(path);
      audio.volume = this.volume;
      audio.preload = 'auto';

      // Gestisci errori di caricamento in modo silenzioso
      audio.addEventListener('error', () => {
        console.warn(`Could not load sound: ${name}`);
      });

      this.sounds.set(name, audio);
    });
  }

  play(soundName: string) {
    if (!this.enabled) return;

    const sound = this.sounds.get(soundName);
    if (sound) {
      // Clona il suono per permettere riproduzioni multiple sovrapposte
      const clone = sound.cloneNode(true) as HTMLAudioElement;
      clone.volume = this.volume;
      clone.play().catch(err => {
        // Ignora errori di riproduzione (es. user interaction required)
        console.debug(`Could not play sound ${soundName}:`, err);
      });
    }
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.sounds.forEach(sound => {
      sound.volume = this.volume;
    });
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
