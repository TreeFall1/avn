import { createInventoryHandler } from '../../../lib/server/inventory-handler.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = createInventoryHandler();
