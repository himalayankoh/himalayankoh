/** Wholesale UI quantities are boxes; canonical stock and API quantities remain pieces. */
export function boxCount(pieces: number, piecesPerBox: number): number {
  return Math.ceil(pieces / piecesPerBox);
}

export function piecesFromBoxes(boxes: number, piecesPerBox: number, loosePieces = 0): number {
  if (!Number.isSafeInteger(piecesPerBox) || piecesPerBox < 1 || !Number.isSafeInteger(boxes) || boxes < 0 || !Number.isSafeInteger(loosePieces) || loosePieces < 0 || loosePieces >= piecesPerBox) {
    throw new Error('Enter whole boxes and fewer loose pieces than one full box.');
  }
  const total = boxes * piecesPerBox + loosePieces;
  if (!Number.isSafeInteger(total)) throw new Error('The stock quantity is too large.');
  return total;
}

/** Multiply the existing cents-rounded piece price; do not invent a new box price. */
export function pricePerBox(unitPrice: number, piecesPerBox: number): number {
  return Math.round(unitPrice * 100) * piecesPerBox / 100;
}
