#!/bin/bash

# ローカルでビルド
echo "Building locally..."
npm install --legacy-peer-deps
npx expo export --platform web --output-dir dist

# Vercelにデプロイ
echo "Deploying to Vercel..."
vercel --prod

echo "Deployment complete!"