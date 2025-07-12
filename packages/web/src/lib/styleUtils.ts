// packages/web/src/lib/styleUtils.ts
import * as d3 from 'd3-scale';

/**
 * The master color function. It takes a sentiment score and returns a
 * D3-calculated color. This is the core of your visual style.
 */
export function getBubbleFillStyle(score: number | null | undefined) {
  const BUBBLE_OPACITY = 1.0;
  let colorString: string;
  const s = score || 0; // Default to 0 if score is null/undefined

  const positiveColorScale = d3.scaleLinear<string>()
    .domain([0.05, 1.0])
    .range(['#9fad42', '#2a8d64'])
    .clamp(true);

  const negativeColorScale = d3.scaleLinear<string>()
    .domain([-0.05, -1.0])
    .range(['#CDb14c', '#DE3B3B'])
    .clamp(true);

  if (s >= 0.05) {
    colorString = positiveColorScale(s);
  } else if (s <= -0.05) {
    colorString = negativeColorScale(s);
  } else {
    colorString = '#BFBFBF'; // Neutral color
  }
  
  return { fill: colorString, fillOpacity: BUBBLE_OPACITY };
}

/**
 * A helper that returns style properties for smaller elements like word tags.
 */
export function getSentimentStyle(score: number | null | undefined) {
  const { fill } = getBubbleFillStyle(score);
  // Always use white text on the dark, saturated backgrounds for high contrast
  const textColor = '#FFFFFF'; 
  return { backgroundColor: fill, color: textColor };
}