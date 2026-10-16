import {sqliteTable,text,integer,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const collections=sqliteTable('profi_collections',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),ownerName:text('owner_name').notNull().default(''),baselineHash:text('baseline_hash').notNull(),baselineJson:text('baseline_json').notNull(),catalogVersion:text('catalog_version').notNull(),createdAt:integer('created_at').notNull()
},table=>[uniqueIndex('profi_owner_baseline').on(table.ownerId,table.baselineHash)]);
export const reviews=sqliteTable('profi_reviews',{
 id:text('id').primaryKey(),collectionId:text('collection_id').notNull().references(()=>collections.id),firstName:text('first_name').notNull(),lastName:text('last_name').notNull(),nameKey:text('name_key').notNull(),deviceKey:text('device_key').notNull(),dataJson:text('data_json').notNull(),submittedAt:integer('submitted_at').notNull()
},table=>[uniqueIndex('profi_collection_name').on(table.collectionId,table.nameKey),uniqueIndex('profi_collection_device').on(table.collectionId,table.deviceKey)]);
export const accounts=sqliteTable('profi_accounts',{
 id:text('id').primaryKey(),login:text('login').notNull().unique(),passwordHash:text('password_hash').notNull(),salt:text('salt').notNull(),createdAt:integer('created_at').notNull()
});
export const sessions=sqliteTable('profi_sessions',{
 tokenHash:text('token_hash').primaryKey(),accountId:text('account_id').notNull().references(()=>accounts.id),expiresAt:integer('expires_at').notNull()
});
export const authLimits=sqliteTable('profi_auth_limits',{
 key:text('key').primaryKey(),attempts:integer('attempts').notNull(),windowStart:integer('window_start').notNull()
});
