import * as THREE from 'three';

export interface SignOptions {
  width?: number;
  height?: number;
  background?: string;
  foreground?: string;
  accent?: string;
  subtitle?: string;
  border?: string;
}

export function createSignTexture(title: string, options: SignOptions = {}): THREE.CanvasTexture {
  const width = options.width ?? 512;
  const height = options.height ?? 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');

  const background = options.background ?? '#f8edda';
  const foreground = options.foreground ?? '#173633';
  const accent = options.accent ?? '#f2a146';
  const border = options.border ?? '#173633';

  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  // Grainy paper-ish texture.
  context.save();
  context.globalAlpha = 0.07;
  for (let i = 0; i < 1000; i += 1) {
    context.fillStyle = i % 2 ? '#173633' : '#ffffff';
    const x = Math.random() * width;
    const y = Math.random() * height;
    context.fillRect(x, y, 1.4, 1.4);
  }
  context.restore();

  context.strokeStyle = border;
  context.lineWidth = Math.max(8, width * 0.017);
  context.strokeRect(context.lineWidth / 2, context.lineWidth / 2, width - context.lineWidth, height - context.lineWidth);

  context.fillStyle = accent;
  context.fillRect(width * 0.065, height * 0.15, width * 0.055, height * 0.46);

  context.fillStyle = foreground;
  context.font = `900 ${Math.floor(height * 0.21)}px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  const titleX = width * 0.15;
  const titleY = options.subtitle ? height * 0.4 : height * 0.5;
  const availableWidth = width * 0.76;
  const measured = context.measureText(title).width;
  if (measured > availableWidth) {
    context.save();
    context.translate(titleX, titleY);
    context.scale(availableWidth / measured, 1);
    context.fillText(title, 0, 0);
    context.restore();
  } else {
    context.fillText(title, titleX, titleY);
  }

  if (options.subtitle) {
    context.fillStyle = 'rgba(23, 54, 51, 0.62)';
    context.font = `700 ${Math.floor(height * 0.085)}px "Avenir Next", "Trebuchet MS", sans-serif`;
    context.fillText(options.subtitle.toUpperCase(), titleX, height * 0.67);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createSoftCircleTexture(size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  gradient.addColorStop(0.75, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createSunTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size * 0.5);
  gradient.addColorStop(0, 'rgba(255,250,218,1)');
  gradient.addColorStop(0.28, 'rgba(255,236,174,0.98)');
  gradient.addColorStop(0.57, 'rgba(255,214,127,0.38)');
  gradient.addColorStop(1, 'rgba(255,199,101,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
