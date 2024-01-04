import {createCanvas, loadImage} from 'canvas';
import * as fs from 'fs';
import * as crypto from "crypto";
import {Emoji} from "../interfaces/configs";

const size = 700; // Size of the square image

function generateRandomString(length: number) {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex') // convert to hexadecimal format
    .slice(0, length); // return required number of characters
}

function getRandomIntInclusive(max: number) {
  return Math.floor(Math.random() * (max + 1));
}

export async function createSticker(
  text: string,
  alertType: "rocket" | "plane" | "computer",
  place: Emoji,
  shouldRotate: boolean = true,
  runTimeStr: string = "",
) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  
  context.fillStyle = 'rgba(0, 0, 0, 0)'; // Transparent background
  context.fillRect(0, 0, size, size);

// Function to load and draw emojis
  const drawEmojis = async () => {
    const filename = `stickers/generator/${generateRandomString(10)}.png`
    try {
      const alertTypeNum = getRandomIntInclusive(2)
      const houseNum = getRandomIntInclusive(4)
      const rocketEmoji = await loadImage(`stickers/emojis/${alertType}-${alertTypeNum}.png`); // Path to rocket emoji image
      const houseEmoji = await loadImage(`stickers/emojis/${place}-${houseNum}.png`); // Path to house emoji image
      
      // Rocket emoji position and size
      const rocketX = 350;
      const rocketY = 200;
      const rocketWidth = 140;
      const rocketHeight = 140;
      
      // Translate and rotate for rocket emoji
      context.translate(rocketX + rocketWidth / 2, rocketY + rocketHeight / 2);
      if (shouldRotate) {
        context.rotate(Math.PI); // 180 degrees
      }
      context.drawImage(rocketEmoji, -rocketWidth / 2, -rocketHeight / 2, rocketWidth, rocketHeight);
      if (shouldRotate) {
        context.rotate(-Math.PI); // Rotate back
      }
      context.translate(-(rocketX + rocketWidth / 2), -(rocketY + rocketHeight / 2));
      
      // Draw house emoji
      context.drawImage(houseEmoji, 0, 300, 300, 300); // Adjust size and position as needed
      
      
      const textX = 500; // X position of the text
      const textY = 400; // Y position of the text
      context.font = '80px Arial';
      const textMeasurements = context.measureText(text);
      
      // Calculate background size and position
      const padding = 10; // Adjust padding as needed
      const bgWidth = textMeasurements.width + 2 * padding;
      const bgHeight = textMeasurements.actualBoundingBoxAscent + textMeasurements.actualBoundingBoxDescent + 2 * padding;
      
      // Translate and rotate context
      context.translate(textX, textY);
      context.rotate(-30 * Math.PI / 180); // Rotate by -30 degrees
      
      // Draw text background
      context.fillStyle = 'red';
      context.fillRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight);
      
      // Draw text
      context.fillStyle = 'white'; // Text color
      context.fillText(text, -textMeasurements.width / 2, textMeasurements.actualBoundingBoxAscent / 2);
      
      // Reset transformation
      context.rotate(30 * Math.PI / 180); // Rotate back
      context.translate(-textX, -textY); // Move back to the original position
      
      if (runTimeStr) {
        const runTimeTextX = size / 2; // Center of the image
        const runTimeTextY = 80; // Y position at the top
        context.font = '60px Arial';
        const runTimeTextMeasurements = context.measureText(runTimeStr);
        
        // Calculate background size and position for runTimeStr
        const runTimeBgWidth = runTimeTextMeasurements.width + 40; // Additional padding for background
        const runTimeBgHeight = runTimeTextMeasurements.actualBoundingBoxAscent + runTimeTextMeasurements.actualBoundingBoxDescent + 20;
        
        // Draw runTimeStr background
        context.fillStyle = 'rgba(255, 0, 0, 0.5)'; // Soft red background
        context.fillRect(runTimeTextX - runTimeBgWidth / 2, runTimeTextY - runTimeTextMeasurements.actualBoundingBoxAscent - 10, runTimeBgWidth, runTimeBgHeight);
        
        // Draw runTimeStr text
        context.fillStyle = 'white'; // White text color
        context.fillText(runTimeStr, runTimeTextX - runTimeTextMeasurements.width / 2, runTimeTextY);
      }
      
      // Save to a file
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(filename, buffer);
    } catch (error) {
      console.error('Error drawing emojis:', error);
    }
    return filename;
  };
  return await drawEmojis();
}
