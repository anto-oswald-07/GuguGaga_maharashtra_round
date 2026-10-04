import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildClipPrompt } from '@creatorai/shared';

describe('buildClipPrompt', () => {
  it('generates high-impact prompt for HOOK scene', () => {
    const prompt = buildClipPrompt({
      title: 'Hook: The Problem',
      beatType: 'HOOK',
      spokenText: 'Most creators waste 10 hours editing a 30-second video.',
      targetDurationMs: 3000,
      scriptTopic: 'Video Editing Productivity',
      style: 'cinematic',
    });

    assert.ok(prompt.includes('High-impact visual hook'));
    assert.ok(prompt.includes('Most creators waste 10 hours'));
    assert.ok(prompt.includes('slow push-in tracking shot'));
    assert.ok(prompt.includes('vertical 9:16 aspect ratio'));
    assert.ok(prompt.includes('~3s duration'));
  });

  it('generates B-roll prompt for POINT scene with tech style', () => {
    const prompt = buildClipPrompt({
      title: 'Point 1: Auto Trimming',
      beatType: 'POINT',
      spokenText: 'AI automatically finds the best clips from your footage.',
      targetDurationMs: 5000,
      style: 'tech',
      camera: 'dynamic',
    });

    assert.ok(prompt.includes('Engaging B-roll sequence'));
    assert.ok(prompt.includes('AI automatically finds'));
    assert.ok(prompt.includes('modern creator tech studio'));
    assert.ok(prompt.includes('neon edge rim lights'));
    assert.ok(prompt.includes('~5s duration'));
  });

  it('generates payoff prompt for CTA scene with studio style', () => {
    const prompt = buildClipPrompt({
      title: 'Call to Action',
      beatType: 'CTA',
      spokenText: 'Follow for more editing tips and tools.',
      targetDurationMs: 3000,
      style: 'studio',
      camera: 'orbit',
    });

    assert.ok(prompt.includes('High-energy closing payoff'));
    assert.ok(prompt.includes('negative space for bold caption overlay'));
    assert.ok(prompt.includes('bright minimalist studio'));
    assert.ok(prompt.includes('360-degree orbit'));
  });
});
