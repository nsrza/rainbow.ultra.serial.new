#!/usr/bin/env node
/**
 * Generate TTS audio files with word-level timestamps for RAINBOW.ULTRA
 *
 * Usage:
 *   export INWORLD_API_KEY='your-base64-api-key'
 *   node generate-audio.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const API_URL = 'https://api.inworld.ai/tts/v1/voice';
const VOICE_ID = 'Ashley'; // Female voice - as if Nima is reading
const MODEL_ID = 'inworld-tts-1-max'; // Best quality model
const MAX_CHARS = 1800; // Stay under 2000 limit with buffer

// Pause durations (in seconds)
const PAUSE_CHAPTER = 3.0;   // Between chapters
const PAUSE_SECTION = 2.0;   // At ◇ ◇ ◇ breaks
const PAUSE_SCENE = 1.0;     // At --- breaks

// Get API key from environment
const API_KEY = process.env.INWORLD_API_KEY;
if (!API_KEY) {
    console.error('Error: INWORLD_API_KEY environment variable not set');
    console.error('Usage: export INWORLD_API_KEY="your-base64-key" && node generate-audio.js');
    process.exit(1);
}

// Books to process
const BOOKS = [
    { file: 'PROLOGUE.md', name: 'prologue' },
    { file: 'BOOK_ONE_THE_BREAKING.md', name: 'book1' },
    { file: 'BOOK_TWO_THE_LIVING.md', name: 'book2' },
    { file: 'BOOK_THREE_THE_47_DAYS.md', name: 'book3' }
];

// Note: Silence is handled by the player using timeouts, no MP3 needed

// Parse markdown into structured sections
function parseMarkdownStructure(markdown) {
    const sections = [];

    // Split by chapter headers (# or ##)
    const chapterPattern = /^(#{1,2})\s+(.+)$/gm;
    const sectionBreakPattern = /◇\s*◇\s*◇/;
    const sceneBreakPattern = /^---+$/m;

    let lastIndex = 0;
    let match;

    // Find all chapter headers
    const chapters = [];
    while ((match = chapterPattern.exec(markdown)) !== null) {
        chapters.push({
            index: match.index,
            level: match[1].length,
            title: match[2],
            fullMatch: match[0]
        });
    }

    // Process content between chapters
    for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        const nextChapter = chapters[i + 1];
        const contentStart = chapter.index + chapter.fullMatch.length;
        const contentEnd = nextChapter ? nextChapter.index : markdown.length;
        const content = markdown.slice(contentStart, contentEnd);

        // Skip empty chapters (like "PART ONE: THE PAST")
        const cleanContent = content.replace(/---+/g, '').replace(/◇\s*◇\s*◇/g, '').trim();
        if (!cleanContent) {
            continue;
        }

        // Split content by section breaks
        const sectionParts = content.split(sectionBreakPattern);

        for (let j = 0; j < sectionParts.length; j++) {
            const sectionContent = sectionParts[j];

            // Split by scene breaks
            const sceneParts = sectionContent.split(sceneBreakPattern);

            for (let k = 0; k < sceneParts.length; k++) {
                const sceneContent = sceneParts[k].trim();

                if (sceneContent) {
                    sections.push({
                        type: 'content',
                        text: sceneContent,
                        chapter: chapter.title
                    });
                }

                // Add scene pause between scenes (not after last)
                if (k < sceneParts.length - 1) {
                    sections.push({
                        type: 'pause',
                        pauseType: 'scene',
                        duration: PAUSE_SCENE
                    });
                }
            }

            // Add section pause between ◇ ◇ ◇ sections (not after last)
            if (j < sectionParts.length - 1) {
                sections.push({
                    type: 'pause',
                    pauseType: 'section',
                    duration: PAUSE_SECTION
                });
            }
        }

        // Add chapter pause between chapters (not after last)
        if (i < chapters.length - 1 && cleanContent) {
            sections.push({
                type: 'pause',
                pauseType: 'chapter',
                duration: PAUSE_CHAPTER
            });
        }
    }

    return sections;
}

// Clean text for TTS
function cleanTextForTTS(text) {
    return text
        // Remove any remaining headers
        .replace(/^#+ .+$/gm, '')
        // Remove horizontal rules
        .replace(/---+/g, '')
        // Remove section breaks (should already be processed)
        .replace(/◇\s*◇\s*◇/g, '')
        // Convert emphasis to plain text
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        // Remove blockquote markers
        .replace(/^> /gm, '')
        // Clean up location/time headers (italicized)
        .replace(/^\*([^*]+)\*$/gm, '$1')
        // Clean up multiple newlines
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Split text into chunks under character limit
function splitIntoChunks(text, maxChars) {
    const cleanText = cleanTextForTTS(text);
    if (!cleanText) return [];

    const chunks = [];
    const sentences = cleanText.split(/(?<=[.!?])\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
        if ((currentChunk + ' ' + sentence).length > maxChars) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            // Handle very long sentences
            if (sentence.length > maxChars) {
                const words = sentence.split(' ');
                currentChunk = '';
                for (const word of words) {
                    if ((currentChunk + ' ' + word).length > maxChars) {
                        chunks.push(currentChunk.trim());
                        currentChunk = word;
                    } else {
                        currentChunk += ' ' + word;
                    }
                }
            } else {
                currentChunk = sentence;
            }
        } else {
            currentChunk += ' ' + sentence;
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

// Call Inworld TTS API
function synthesizeSpeech(text, chunkIndex) {
    return new Promise((resolve, reject) => {
        const requestBody = JSON.stringify({
            text: text,
            voiceId: VOICE_ID,
            modelId: MODEL_ID,
            audioEncoding: 'MP3',
            bitRate: 128000,
            sampleRateHertz: 44100,
            timestampType: 'WORD'
        });

        const url = new URL(API_URL);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Basic ${API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`API error ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    const response = JSON.parse(data);
                    resolve(response);
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${e.message}`));
                }
            });
        });

        req.on('error', reject);
        req.write(requestBody);
        req.end();
    });
}

// Process a single book
async function processBook(bookFile, bookName) {
    console.log(`\nProcessing ${bookFile}...`);

    const filePath = path.join(__dirname, bookFile);
    if (!fs.existsSync(filePath)) {
        console.log(`  Skipping ${bookFile} - file not found`);
        return null;
    }

    const markdown = fs.readFileSync(filePath, 'utf8');
    const sections = parseMarkdownStructure(markdown);

    console.log(`  Found ${sections.length} sections (content + pauses)`);

    const audioDir = path.join(__dirname, 'audio', bookName);
    fs.mkdirSync(audioDir, { recursive: true });

    const manifest = {
        book: bookName,
        chunks: [],
        totalDuration: 0
    };

    let chunkIndex = 0;

    for (const section of sections) {
        if (section.type === 'pause') {
            // Add pause entry to manifest (player handles via timeout)
            manifest.chunks.push({
                index: chunkIndex,
                type: 'pause',
                pauseType: section.pauseType,
                duration: section.duration,
                text: '',
                words: [],
                wordStartTimes: [],
                wordEndTimes: []
            });

            manifest.totalDuration += section.duration;
            console.log(`  Added ${section.pauseType} pause (${section.duration}s)`);

            chunkIndex++;
        } else {
            // Process content into chunks
            const textChunks = splitIntoChunks(section.text, MAX_CHARS);

            for (const chunk of textChunks) {
                if (!chunk.trim()) continue;

                console.log(`  Processing chunk ${chunkIndex + 1} (${chunk.length} chars)...`);

                try {
                    const response = await synthesizeSpeech(chunk, chunkIndex);

                    // Save audio file
                    const audioBuffer = Buffer.from(response.audioContent, 'base64');
                    const audioFile = `chunk_${String(chunkIndex).padStart(4, '0')}.mp3`;
                    const audioPath = path.join(audioDir, audioFile);
                    fs.writeFileSync(audioPath, audioBuffer);

                    // Extract word timing
                    const wordAlignment = response.timestampInfo?.wordAlignment || {
                        words: [],
                        wordStartTimeSeconds: [],
                        wordEndTimeSeconds: []
                    };

                    // Calculate chunk duration
                    const endTimes = wordAlignment.wordEndTimeSeconds || [];
                    const chunkDuration = endTimes.length > 0 ? Math.max(...endTimes) : 0;

                    manifest.chunks.push({
                        index: chunkIndex,
                        type: 'content',
                        text: chunk,
                        audioFile: audioFile,
                        duration: chunkDuration,
                        words: wordAlignment.words || [],
                        wordStartTimes: wordAlignment.wordStartTimeSeconds || [],
                        wordEndTimes: wordAlignment.wordEndTimeSeconds || []
                    });

                    manifest.totalDuration += chunkDuration;

                    console.log(`    Saved ${audioPath} (${chunkDuration.toFixed(2)}s)`);

                    // Rate limiting - wait 200ms between requests
                    await new Promise(r => setTimeout(r, 200));

                    chunkIndex++;

                } catch (error) {
                    console.error(`    Error processing chunk ${chunkIndex}: ${error.message}`);
                    // Continue with next chunk
                }
            }
        }
    }

    // Save manifest
    const manifestPath = path.join(audioDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  Saved manifest to ${manifestPath}`);
    console.log(`  Total duration: ${(manifest.totalDuration / 60).toFixed(1)} minutes`);

    return manifest;
}

// Main execution
async function main() {
    console.log('RAINBOW.ULTRA Audio Generator');
    console.log('=============================');
    console.log(`Voice: ${VOICE_ID}`);
    console.log(`Model: ${MODEL_ID}`);
    console.log(`Pauses: chapter=${PAUSE_CHAPTER}s, section=${PAUSE_SECTION}s, scene=${PAUSE_SCENE}s`);

    const results = {};

    for (const book of BOOKS) {
        try {
            const manifest = await processBook(book.file, book.name);
            if (manifest) {
                results[book.name] = manifest;
            }
        } catch (error) {
            console.error(`Error processing ${book.file}: ${error.message}`);
        }
    }

    // Save master manifest
    const masterManifest = {
        generated: new Date().toISOString(),
        voice: VOICE_ID,
        model: MODEL_ID,
        pauses: {
            chapter: PAUSE_CHAPTER,
            section: PAUSE_SECTION,
            scene: PAUSE_SCENE
        },
        books: results
    };

    const masterPath = path.join(__dirname, 'audio', 'manifest.json');
    fs.writeFileSync(masterPath, JSON.stringify(masterManifest, null, 2));
    console.log(`\nSaved master manifest to ${masterPath}`);

    // Summary
    let totalMinutes = 0;
    for (const [name, manifest] of Object.entries(results)) {
        totalMinutes += manifest.totalDuration / 60;
    }
    console.log(`\nTotal audio duration: ${totalMinutes.toFixed(1)} minutes`);
}

main().catch(console.error);
