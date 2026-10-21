import { describe, expect, it } from 'vitest';
import { Bicycle } from './Bicycle';

describe('Bicycle', () => {
  it('uses the Three.js +Y sign for the front wheel and handlebars', () => {
    const bike = new Bicycle();
    bike.update(0, -0.3);
    expect(bike.getSteeringPivot().rotation.y).toBeCloseTo(-0.3, 5);
    bike.update(0, 0.3);
    expect(bike.getSteeringPivot().rotation.y).toBeCloseTo(0.3, 5);
  });
});
