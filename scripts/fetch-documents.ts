#!/usr/bin/env bun
/**
 * SFC Document Fetcher Script
 * Triggers document downloads for all categories
 */

const BASE_URL = 'http://localhost:3000';

// Test if server is running
async function healthCheck() {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// Search and fetch circulars
async function fetchCirculars() {
  console.log('📋 Fetching Circulars...');
  
  // Search for circulars from 2024-2026
  const years = [2024, 2025, 2026];
  let totalFound = 0;
  
  for (const year of years) {
    try {
      const res = await fetch(`${BASE_URL}/circulars?year=${year}`);
      const data = await res.json();
      console.log(`  Year ${year}: ${data.count} circulars in DB`);
      totalFound += data.count;
    } catch (err) {
      console.error(`  Error fetching year ${year}:`, err.message);
    }
  }
  
  return totalFound;
}

// Search and fetch guidelines
async function fetchGuidelines() {
  console.log('📘 Fetching Guidelines...');
  
  try {
    const res = await fetch(`${BASE_URL}/guidelines`);
    const data = await res.json();
    console.log(`  Found: ${data.count} guidelines in DB`);
    return data.count;
  } catch (err) {
    console.error('  Error:', err.message);
    return 0;
  }
}

// Search and fetch consultations
async function fetchConsultations() {
  console.log('📢 Fetching Consultations...');
  
  try {
    const res = await fetch(`${BASE_URL}/consultations`);
    const data = await res.json();
    console.log(`  Found: ${data.count} consultations in DB`);
    return data.count;
  } catch (err) {
    console.error('  Error:', err.message);
    return 0;
  }
}

// Search and fetch news
async function fetchNews() {
  console.log('📰 Fetching News...');
  
  try {
    const res = await fetch(`${BASE_URL}/news`);
    const data = await res.json();
    console.log(`  Found: ${data.count} news items in DB`);
    return data.count;
  } catch (err) {
    console.error('  Error:', err.message);
    return 0;
  }
}

// Get workflow stats
async function getWorkflowStats() {
  try {
    const res = await fetch(`${BASE_URL}/workflows/stats`);
    return await res.json();
  } catch {
    return null;
  }
}

// Main execution
async function main() {
  console.log('🔍 SFC Document Fetcher\n');
  
  // Check if server is running
  const isHealthy = await healthCheck();
  if (!isHealthy) {
    console.error('❌ Server is not running. Please start it first with:');
    console.error('   tmux attach -t sfc-fetch');
    process.exit(1);
  }
  
  console.log('✅ Server is healthy\n');
  
  // Get initial stats
  const initialStats = await getWorkflowStats();
  console.log('📊 Initial State:');
  console.log(`   Total documents: ${initialStats?.total || 0}`);
  console.log(`   By category:`, initialStats?.byCategory || {});
  console.log();
  
  // Fetch each category
  console.log('🚀 Starting document fetch...\n');
  
  const circulars = await fetchCirculars();
  const guidelines = await fetchGuidelines();
  const consultations = await fetchConsultations();
  const news = await fetchNews();
  
  // Final stats
  console.log('\n📊 Final State:');
  const finalStats = await getWorkflowStats();
  console.log(`   Total documents: ${finalStats?.total || 0}`);
  console.log(`   By category:`, finalStats?.byCategory || {});
  console.log(`   By status:`, finalStats?.byStatus || {});
  
  console.log('\n✅ Done!');
}

main().catch(console.error);
