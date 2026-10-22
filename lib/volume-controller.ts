/** Owns only volume; never unmutes the player or starts playback. */
export class VolumeController {
  private originals = new Map<HTMLMediaElement, number>();
  private target: number | null = null;
  private policyTarget: number | null = null;
  private policyKey = '';
  private editable = false;
  private observed = new Map<HTMLMediaElement, number>();
  constructor(private changed: (volume: number) => void = () => {}) {}
  private onVolume = (event: Event) => {
    const media = event.currentTarget as HTMLMediaElement;
    if (media.volume === this.observed.get(media)) return; // Includes mute-only and our own writes.
    this.observed.set(media, media.volume);
    if (!this.editable) { this.enforce(media); return; }
    this.target = media.volume;
    this.changed(media.volume);
    for (const other of this.originals.keys()) if (other !== media) this.enforce(other);
  };
  private onLifecycle = (event: Event) => this.enforce(event.currentTarget as HTMLMediaElement);

  setTarget(target: number | null, key = '', editable = false) {
    if (target === null) { this.restore(); return; }
    if (this.policyTarget === target && this.policyKey === key && this.editable === editable) return;
    this.policyTarget = target;
    this.policyKey = key;
    this.editable = editable;
    this.target = target;
    for (const media of this.originals.keys()) this.enforce(media);
  }

  attach(media: HTMLMediaElement) {
    if (this.originals.has(media)) return;
    this.originals.set(media, media.volume);
    this.observed.set(media, media.volume);
    media.addEventListener('volumechange', this.onVolume);
    media.addEventListener('play', this.onLifecycle);
    media.addEventListener('loadedmetadata', this.onLifecycle);
    this.enforce(media);
  }

  prune() {
    for (const media of this.originals.keys()) if (!media.isConnected) this.detach(media);
  }

  private enforce(media: HTMLMediaElement) {
    if (this.target === null) return;
    if (media.volume !== this.target) media.volume = this.target;
    this.observed.set(media, media.volume);
  }

  restore() {
    this.target = null;
    this.policyTarget = null;
    this.policyKey = '';
    this.editable = false;
    for (const media of this.originals.keys()) this.detach(media);
  }

  private detach(media: HTMLMediaElement) {
    media.removeEventListener('volumechange', this.onVolume);
    media.removeEventListener('play', this.onLifecycle);
    media.removeEventListener('loadedmetadata', this.onLifecycle);
    const original = this.originals.get(media);
    if (original !== undefined) media.volume = original;
    this.originals.delete(media);
    this.observed.delete(media);
  }

  destroy() { for (const media of this.originals.keys()) this.detach(media); }
}
