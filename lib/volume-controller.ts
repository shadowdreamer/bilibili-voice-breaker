/** Owns only volume; never unmutes the player or starts playback. */
export class VolumeController {
  private originals = new Map<HTMLMediaElement, number>();
  private target: number | null = null;
  private onVolume = (event: Event) => this.enforce(event.currentTarget as HTMLMediaElement);

  setTarget(target: number | null) {
    if (target === null) { this.restore(); return; }
    this.target = target;
    for (const media of this.originals.keys()) this.enforce(media);
  }

  attach(media: HTMLMediaElement) {
    if (this.originals.has(media)) return;
    this.originals.set(media, media.volume);
    media.addEventListener('volumechange', this.onVolume);
    media.addEventListener('play', this.onVolume);
    media.addEventListener('loadedmetadata', this.onVolume);
    this.enforce(media);
  }

  prune() {
    for (const media of this.originals.keys()) if (!media.isConnected) this.detach(media);
  }

  private enforce(media: HTMLMediaElement) {
    if (this.target === null) return;
    if (Math.abs(media.volume - this.target) > 0.0001) media.volume = this.target;
  }

  restore() {
    this.target = null;
    for (const media of this.originals.keys()) this.detach(media);
  }

  private detach(media: HTMLMediaElement) {
    media.removeEventListener('volumechange', this.onVolume);
    media.removeEventListener('play', this.onVolume);
    media.removeEventListener('loadedmetadata', this.onVolume);
    const original = this.originals.get(media);
    if (original !== undefined) media.volume = original;
    this.originals.delete(media);
  }

  destroy() { for (const media of this.originals.keys()) this.detach(media); }
}
