// CSV parsing functions for client-side file upload
function parseCSV(csvText) {
    // Simple CSV parser that handles quoted fields and escaped quotes
    const lines = [];
    let currentLine = [];
    let currentField = '';
    let insideQuotes = false;
    let i = 0;
    
    while (i < csvText.length) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];
        
        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                // Escaped quote inside quoted field
                currentField += '"';
                i += 2;
                continue;
            } else {
                // Toggle quote state
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            // End of field
            currentLine.push(currentField.trim());
            currentField = '';
        } else if ((char === '\n' || char === '\r') && !insideQuotes) {
            // End of line
            if (currentField || currentLine.length > 0) {
                currentLine.push(currentField.trim());
                if (currentLine.some(field => field.length > 0)) {
                    lines.push(currentLine);
                }
            }
            currentLine = [];
            currentField = '';
            
            // Skip \r\n combinations
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
        } else {
            currentField += char;
        }
        i++;
    }
    
    // Handle last field/line
    if (currentField || currentLine.length > 0) {
        currentLine.push(currentField.trim());
        if (currentLine.some(field => field.length > 0)) {
            lines.push(currentLine);
        }
    }
    
    return lines;
}

function csvToQuestionPool(csvText, options = {}) {
    // Parse CSV text into question objects
    // Expected CSV format: Question, Type, Reference, Answer
    // Options can override column mapping: { questionCol: 0, typeCol: 1, referenceCol: 2, answerCol: 3, hasHeader: true }
    
    const defaultOptions = {
        questionCol: 0,
        typeCol: 1, 
        referenceCol: 2,
        answerCol: 3,
        hasHeader: true
    };
    
    const opts = { ...defaultOptions, ...options };
    const lines = parseCSV(csvText);
    
    if (lines.length === 0) {
        throw new Error('CSV file is empty');
    }
    
    // Skip header row if present
    const dataRows = opts.hasHeader ? lines.slice(1) : lines;
    
    if (dataRows.length === 0) {
        throw new Error('No data rows found in CSV');
    }
    
    const questions = [];
    const errors = [];
    
    dataRows.forEach((row, index) => {
        const rowNumber = opts.hasHeader ? index + 2 : index + 1; // For error reporting
        
        try {
            // Validate row has enough columns
            const maxCol = Math.max(opts.questionCol, opts.typeCol, opts.referenceCol, opts.answerCol);
            if (row.length <= maxCol) {
                errors.push(`Row ${rowNumber}: Not enough columns (expected at least ${maxCol + 1}, got ${row.length})`);
                return;
            }
            
            const question = row[opts.questionCol]?.trim();
            const type = row[opts.typeCol]?.trim();
            const reference = row[opts.referenceCol]?.trim();
            const answer = row[opts.answerCol]?.trim();
            
            // Validate required fields
            if (!question) {
                errors.push(`Row ${rowNumber}: Question is empty`);
                return;
            }
            if (!type) {
                errors.push(`Row ${rowNumber}: Type is empty`);
                return;
            }
            if (!reference) {
                errors.push(`Row ${rowNumber}: Reference is empty`);
                return;
            }
            if (!answer) {
                errors.push(`Row ${rowNumber}: Answer is empty`);
                return;
            }
            
            // Validate reference format (should be "Book Chapter:Verse" or similar)
            try {
                getBookAndChapter(reference);
            } catch (e) {
                errors.push(`Row ${rowNumber}: Invalid reference format "${reference}"`);
                return;
            }
            
            questions.push({
                question,
                type,
                reference,
                answer
            });
            
        } catch (e) {
            errors.push(`Row ${rowNumber}: ${e.message}`);
        }
    });
    
    if (errors.length > 0) {
        console.warn('CSV parsing warnings:', errors);
    }
    
    if (questions.length === 0) {
        throw new Error('No valid questions found in CSV file');
    }
    
    return {
        questions,
        errors,
        totalRows: dataRows.length,
        validRows: questions.length
    };
}

async function readCSVFile(file) {
    // Read a File object (from HTML input) and parse it as a CSV question pool
    // Returns a promise that resolves to the question pool
    
    if (!file) {
        throw new Error('No file provided');
    }
    
    if (!file.name.toLowerCase().endsWith('.csv')) {
        throw new Error('File must be a CSV file');
    }
    
    if (file.size === 0) {
        throw new Error('File is empty');
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('File is too large (maximum 10MB)');
    }
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const csvText = e.target.result;
                const result = csvToQuestionPool(csvText);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = function() {
            reject(new Error('Failed to read file'));
        };
        
        reader.readAsText(file);
    });
}

// Main question set generation logic
/*
    The logic is basically the same as the existing solution, but with modifications for greater fairness and less predictability.

    Question Set rules in full:
    Depending on user input, include either 1 Situation question, or 1 In-What-Book-and-Chapter question.
    Include 1 quote question, 1 reference question, 1 verse question, and 1 context question.
    Include 4 According-To questions.
    Remaining questions should be general questions for a total of 20 questions.

    Extra rules from new solution:
    - Calculate variable maxAppearances based on the number of chapters available. maxAppearances = Math.max(2, Math.ceil(chapters / 20))
    - Each chapter must be represented once before any may be repeated.
    After generating the set, repeat the below 4 times:
    - At random, each fifth question will be pulled and replaced with a random question of the same type from the entire pool.
    - Check that no chapter is used more than maxAppearances times.

    - At completion, the question set will be shuffled to ensure randomness.

    Download formats are in two forms.
    1. .rtf format to be printed and given to quizmasters.
    2. .json format for use with the QPerformance app.

    RTF: literally questions.
    JSON: No questions, instead metadata about each question - number, type, chapter and verse.
*/

// Shared helper functions
function getBookAndChapter(reference) {
    // Reference format: "BookName Chapter:Verse"
    const lastSpace = reference.lastIndexOf(' ');
    const book = reference.substring(0, lastSpace);
    const chapterPart = reference.substring(lastSpace + 1).split(':')[0];
    const chapter = parseInt(chapterPart, 10);
    return { book, chapter };
}

function groupByType(pool) {
    const map = {};
    pool.forEach(q => {
        if (!map[q.type]) map[q.type] = [];
        map[q.type].push(q);
    });
    return map;
}

function groupByChapter(pool) {
    const map = {};
    pool.forEach(q => {
        const { book, chapter } = getBookAndChapter(q.reference);
        const key = `${book} ${chapter}`;
        if (!map[key]) map[key] = [];
        map[key].push(q);
    });
    return map;
}

function shuffleArray(array) {
    const shuffled = array.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function generateQuestionSet(pool, situation, books, wholePool = null) {
    // pool is an array of question objects. Each question object has a question, a type, a reference, an answer.
    // books is an array of book object. Each has a book name and a range of chapters. This way we can pull from one range of chapters from one book, and a different range from another book, for a single question set.
    // wholePool is the original complete pool before any questions were removed, used as fallback when pool is insufficient

    // Filter the pool to only include questions from the specified books and chapters
    // books: [{ name: 'John', chapters: [1,2,3] }, ...]
    // pool: [{ reference: 'John 3:16', ... }, ...]
    
    // Build a lookup for quick book/chapter inclusion
    const allowed = {};
    books.forEach(b => {
        allowed[b.name] = new Set(b.chapters);
    });

    const filteredPool = pool.filter(q => {
        const { book, chapter } = getBookAndChapter(q.reference);
        return allowed[book] && allowed[book].has(chapter);
    });

    // Also filter wholePool if provided
    const filteredWholePool = wholePool ? wholePool.filter(q => {
        const { book, chapter } = getBookAndChapter(q.reference);
        return allowed[book] && allowed[book].has(chapter);
    }) : filteredPool;

    // Count total unique chapters
    const uniqueChapters = new Set(filteredPool.map(q => {
        const { book, chapter } = getBookAndChapter(q.reference);
        return `${book} ${chapter}`;
    }));
    const chaptersCount = uniqueChapters.size;
    const maxAppearances = Math.max(2, Math.ceil(chaptersCount / 20));

    // Track chapter usage
    const chapterUsage = {};
    uniqueChapters.forEach(ch => chapterUsage[ch] = 0);

    // Group by type for easy selection
    const byType = groupByType(filteredPool);
    const byTypeWhole = wholePool ? groupByType(filteredWholePool) : byType;
    const byChapter = groupByChapter(filteredPool);

    // Helper to pick a question of a type, not exceeding chapter limits
    function pickQuestion(type, usedChapters, poolArr) {
        const candidates = (byType[type] || []).filter(q => {
            const { book, chapter } = getBookAndChapter(q.reference);
            const key = `${book} ${chapter}`;
            return chapterUsage[key] < maxAppearances && !usedChapters.has(key) && poolArr.includes(q) && !usedQuestions.has(q);
        });
        
        // Fallback to wholePool if no candidates found
        if (candidates.length === 0 && wholePool) {
            const wholeCandidates = (byTypeWhole[type] || []).filter(q => {
                const { book, chapter } = getBookAndChapter(q.reference);
                const key = `${book} ${chapter}`;
                return chapterUsage[key] < maxAppearances && !usedChapters.has(key) && !usedQuestions.has(q);
            });
            if (wholeCandidates.length > 0) {
                const q = wholeCandidates[Math.floor(Math.random() * wholeCandidates.length)];
                const { book, chapter } = getBookAndChapter(q.reference);
                chapterUsage[`${book} ${chapter}`]++;
                usedChapters.add(`${book} ${chapter}`);
                usedQuestions.add(q);
                return q;
            }
        }
        
        if (candidates.length === 0) return null;
        const q = candidates[Math.floor(Math.random() * candidates.length)];
        const { book, chapter } = getBookAndChapter(q.reference);
        chapterUsage[`${book} ${chapter}`]++;
        usedChapters.add(`${book} ${chapter}`);
        usedQuestions.add(q);
        // Remove from poolArr
        const idx = poolArr.indexOf(q);
        if (idx !== -1) poolArr.splice(idx, 1);
        return q;
    }

    // Helper to pick a question of a type, allowing repeats up to maxAppearances
    function pickQuestionAllowRepeat(type, poolArr) {
        const candidates = (byType[type] || []).filter(q => {
            const { book, chapter } = getBookAndChapter(q.reference);
            const key = `${book} ${chapter}`;
            return chapterUsage[key] < maxAppearances && poolArr.includes(q) && !usedQuestions.has(q);
        });
        
        // Fallback to wholePool if no candidates found
        if (candidates.length === 0 && wholePool) {
            const wholeCandidates = (byTypeWhole[type] || []).filter(q => {
                const { book, chapter } = getBookAndChapter(q.reference);
                const key = `${book} ${chapter}`;
                return chapterUsage[key] < maxAppearances && !usedQuestions.has(q);
            });
            if (wholeCandidates.length > 0) {
                const q = wholeCandidates[Math.floor(Math.random() * wholeCandidates.length)];
                const { book, chapter } = getBookAndChapter(q.reference);
                chapterUsage[`${book} ${chapter}`]++;
                usedQuestions.add(q);
                return q;
            }
        }
        
        if (candidates.length === 0) return null;
        const q = candidates[Math.floor(Math.random() * candidates.length)];
        const { book, chapter } = getBookAndChapter(q.reference);
        chapterUsage[`${book} ${chapter}`]++;
        usedQuestions.add(q);
        // Remove from poolArr
        const idx = poolArr.indexOf(q);
        if (idx !== -1) poolArr.splice(idx, 1);
        return q;
    }

    // 1. Build the set with required types
    const set = [];
    const usedChapters = new Set();
    const usedQuestions = new Set(); // Track all questions used in this set
    // Make a shallow copy of filteredPool for removal
    const poolArr = filteredPool.slice();
    // Situation or In-What-Book-and-Chapter
    if (situation) {
        const q = pickQuestion('Situation', usedChapters, poolArr);
        if (q) set.push(q);
    } else {
        const q = pickQuestion('In-What-Book-and-Chapter', usedChapters, poolArr);
        if (q) set.push(q);
    }
    // 1 quote, 1 reference, 1 verse, 1 context
    ['Quote', 'Reference', 'Verse', 'Context'].forEach(type => {
        const q = pickQuestion(type, usedChapters, poolArr);
        if (q) set.push(q);
    });
    // 4 According-To
    for (let i = 0; i < 4; ++i) {
        const q = pickQuestion('According-To', usedChapters, poolArr);
        if (q) set.push(q);
    }
    // If still not 20, fill with any type
    while (set.length < 20) {
        const allTypes = Object.keys(byType);
        if (allTypes.length === 0) break;
        const q = pickQuestionAllowRepeat(allTypes[Math.floor(Math.random() * allTypes.length)], poolArr);
        if (!q) break;
        set.push(q);
    }

    // 2. Apply the replacement rule 4 times
    for (let round = 0; round < 4; round++) {
        // At random, each fifth question will be pulled and replaced
        const fifthQuestions = [];
        for (let i = 4; i < set.length; i += 5) { // Every 5th question (0-indexed: 4, 9, 14, 19)
            fifthQuestions.push(i);
        }
        
        if (fifthQuestions.length > 0) {
            const randomFifthIndex = fifthQuestions[Math.floor(Math.random() * fifthQuestions.length)];
            const questionToReplace = set[randomFifthIndex];
            const typeToReplace = questionToReplace.type;
            
            // Find a replacement from the entire filtered pool (not just remaining)
            const replacementCandidates = (wholePool ? filteredWholePool : filteredPool).filter(q => {
                if (q.type !== typeToReplace) return false;
                if (usedQuestions.has(q)) return false; // Don't use questions already in the set
                
                const { book, chapter } = getBookAndChapter(q.reference);
                const key = `${book} ${chapter}`;
                
                // Calculate current usage if we made this replacement
                const currentUsage = set.reduce((count, setQ) => {
                    const { book: setBook, chapter: setChapter } = getBookAndChapter(setQ.reference);
                    const setKey = `${setBook} ${setChapter}`;
                    return setKey === key ? count + 1 : count;
                }, 0);
                
                // Account for removing the question we're replacing
                const { book: oldBook, chapter: oldChapter } = getBookAndChapter(questionToReplace.reference);
                const oldKey = `${oldBook} ${oldChapter}`;
                const adjustedUsage = oldKey === key ? currentUsage - 1 : currentUsage;
                
                return adjustedUsage < maxAppearances;
            });
            
            if (replacementCandidates.length > 0) {
                const replacement = replacementCandidates[Math.floor(Math.random() * replacementCandidates.length)];
                // Update tracking
                usedQuestions.delete(questionToReplace);
                usedQuestions.add(replacement);
                set[randomFifthIndex] = replacement;
            }
        }
    }

    // 3. Shuffle the question set to ensure randomness
    for (let i = set.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [set[i], set[j]] = [set[j], set[i]];
    }

    // Return both the set and the remaining pool (as a new array, not modifying original)
    return { 
        set, 
        remainingPool: pool.filter(q => !usedQuestions.has(q))
    };
}

function generateTypeOnlySet(pool, type, books, wholePool = null) {
    // Build a lookup for quick book/chapter inclusion
    const allowed = {};
    books.forEach(b => {
        allowed[b.name] = new Set(b.chapters);
    });

    // Filter the pool to only include questions from the specified books, chapters, and type
    const filteredPool = pool.filter(q => {
        if (q.type !== type) return false;
        const { book, chapter } = getBookAndChapter(q.reference);
        return allowed[book] && allowed[book].has(chapter);
    });

    // Also filter wholePool if provided
    const filteredWholePool = wholePool ? wholePool.filter(q => {
        if (q.type !== type) return false;
        const { book, chapter } = getBookAndChapter(q.reference);
        return allowed[book] && allowed[book].has(chapter);
    }) : filteredPool;

    // If no questions of this type are available, return empty set
    if (filteredPool.length === 0 && (!wholePool || filteredWholePool.length === 0)) {
        return { set: [], remainingPool: pool.filter(q => q.type === type) };
    }

    // Count total unique chapters for this type
    const allQuestions = filteredWholePool.length > 0 ? filteredWholePool : filteredPool;
    const uniqueChapters = new Set(allQuestions.map(q => {
        const { book, chapter } = getBookAndChapter(q.reference);
        return `${book} ${chapter}`;
    }));
    const chaptersCount = uniqueChapters.size;
    const maxAppearances = Math.max(2, Math.ceil(chaptersCount / 20));

    // Track chapter usage and used questions
    const chapterUsage = {};
    uniqueChapters.forEach(ch => chapterUsage[ch] = 0);
    const usedQuestions = new Set();

    // Helper to pick a question, respecting chapter limits
    function pickQuestionTypeOnly(poolArr, allowRepeats = false) {
        const candidates = poolArr.filter(q => {
            if (usedQuestions.has(q)) return false;
            const { book, chapter } = getBookAndChapter(q.reference);
            const key = `${book} ${chapter}`;
            
            if (allowRepeats) {
                return chapterUsage[key] < maxAppearances;
            } else {
                return chapterUsage[key] === 0; // Only unused chapters
            }
        });

        // Fallback to wholePool if no candidates found
        if (candidates.length === 0 && wholePool && poolArr === filteredPool) {
            return pickQuestionTypeOnly(filteredWholePool, allowRepeats);
        }

        if (candidates.length === 0) return null;
        
        const q = candidates[Math.floor(Math.random() * candidates.length)];
        const { book, chapter } = getBookAndChapter(q.reference);
        const key = `${book} ${chapter}`;
        chapterUsage[key]++;
        usedQuestions.add(q);
        return q;
    }

    // Build the set - first ensure each chapter is represented once
    const set = [];
    const poolArr = filteredPool.slice();

    // Phase 1: Fill from each chapter once
    for (let i = 0; i < uniqueChapters.size && set.length < 20; i++) {
        const q = pickQuestionTypeOnly(poolArr, false);
        if (q) {
            set.push(q);
            // Remove from poolArr
            const idx = poolArr.indexOf(q);
            if (idx !== -1) poolArr.splice(idx, 1);
        }
    }

    // Phase 2: Fill remaining slots allowing chapter repeats up to maxAppearances
    while (set.length < 20) {
        const q = pickQuestionTypeOnly(poolArr, true);
        if (!q) break;
        set.push(q);
        // Remove from poolArr
        const idx = poolArr.indexOf(q);
        if (idx !== -1) poolArr.splice(idx, 1);
    }

    // Apply replacement rule 4 times (similar to generateQuestionSet)
    for (let round = 0; round < 4; round++) {
        const fifthQuestions = [];
        for (let i = 4; i < set.length; i += 5) {
            fifthQuestions.push(i);
        }
        
        if (fifthQuestions.length > 0) {
            const randomFifthIndex = fifthQuestions[Math.floor(Math.random() * fifthQuestions.length)];
            const questionToReplace = set[randomFifthIndex];
            
            // Find a replacement from the entire filtered pool
            const replacementCandidates = (wholePool ? filteredWholePool : filteredPool).filter(q => {
                if (usedQuestions.has(q)) return false;
                
                const { book, chapter } = getBookAndChapter(q.reference);
                const key = `${book} ${chapter}`;
                
                // Calculate current usage if we made this replacement
                const currentUsage = set.reduce((count, setQ) => {
                    const { book: setBook, chapter: setChapter } = getBookAndChapter(setQ.reference);
                    const setKey = `${setBook} ${setChapter}`;
                    return setKey === key ? count + 1 : count;
                }, 0);
                
                // Account for removing the question we're replacing
                const { book: oldBook, chapter: oldChapter } = getBookAndChapter(questionToReplace.reference);
                const oldKey = `${oldBook} ${oldChapter}`;
                const adjustedUsage = oldKey === key ? currentUsage - 1 : currentUsage;
                
                return adjustedUsage < maxAppearances;
            });
            
            if (replacementCandidates.length > 0) {
                const replacement = replacementCandidates[Math.floor(Math.random() * replacementCandidates.length)];
                // Update tracking
                usedQuestions.delete(questionToReplace);
                usedQuestions.add(replacement);
                set[randomFifthIndex] = replacement;
            }
        }
    }

    // Shuffle the final set for randomness
    for (let i = set.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [set[i], set[j]] = [set[j], set[i]];
    }

    // Return the set and remaining pool (only questions of the specified type)
    return { 
        set, 
        remainingPool: pool.filter(q => q.type === type && !usedQuestions.has(q))
    };
}

function genQperfSet(roundName, set) {// Generate a set readable for QPerformance. QPerformance only needs the type and reference of each question.
    // Make it in JSON format, embed the roundName
    const qperfSet = {
        round: roundName,
        questions: set.map(q => ({
            type: q.type,
            reference: q.reference
        }))
    };
    return JSON.stringify(qperfSet, null, 2);
}

function genQperfFile(roundNames, sets) {// From a collection of sets, generate a QPerformance file. Format in JSON.
    // Iter over sets, pass each set and its name to genQperfSet
    // Throw an error if roundNames and sets are not the same length
    if (roundNames.length !== sets.length) {
        throw new Error("roundNames and sets must be the same length");
    }
    const qperfFile = {};
    for (let i = 0; i < roundNames.length; i++) {
        const roundName = roundNames[i];
        const set = sets[i];
        qperfFile[roundName] = genQperfSet(roundName, set);
    }
    return JSON.stringify(qperfFile, null, 2);
}

function genRTFFile(roundNames, sets, sectionTag) {// Generate an RTF format string of the question set to be included in the file.
    // roundNames = array of round names, these are the names of the sets too. (i.e., they might be "Set #1" or "Round #1" or whatever the user specified)
    // sets = array of sets, each set is an array of question objects.
    // sectionTag = a tag describing which part of the Bible the questions are from, e.g., "Luke 3-20"
    
    if (roundNames.length !== sets.length) {
        throw new Error("roundNames and sets must be the same length");
    }

    // Helper function to generate RTF header with fonts, headers, and footers
    function generateRTFHeader(sectionTag) {
        return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1033{\\fonttbl{\\f0swiss\\fcharset0 Arial;}{\\f1\\froman\\fcharset0 Times New Roman;}} \\viewkind4\\uc1 {\\header \\pard\\plain \\s15\\qr \\li0\\ri0\\widctlpar\\tqc\\tx4320\\tqr\\tx8640\\aspalpha\\aspnum\\faauto \\adjustright\\rin0\\lin0\\itap0\\pararsid6843047 \\fs14\\lang1033\\langfe1033\\cgrid\\langnp1033\\langfenp1033 { ${sectionTag} \\par }}{\\footer \\pard\\plain \\s16\\ql \\li0\\ri0\\widctlpar\\brdrb\\brdrs\\brdrw15\\brsp20 \\tqc\\tx4320\\tqr\\tx8640\\aspalpha\\aspnum\\faauto\\adjustright\\rin0\\lin0\\itap0 \\fs14\\lang1033\\langfe1033\\cgrid\\langnp1033\\langfenp1033 {${sectionTag} \\par }}{\\footer { \\par \\pard \\s16\\qc \\li0\\ri0\\widctlpar\\brdrt\\brdrs\\brdrw15\\brsp20 \\brdrb\\brdrs\\brdrw15\\brsp20 \\tqc\\tx4320\\tqr\\tx8640\\aspalpha\\aspnum\\faauto\\adjustright\\rin0\\lin0\\rtlgutter\\itap0 \\f1\\fs14 A=According To  |  G=General  |  I=In what book & chapter  |  Q=Quote  |  R=Reference  |  S=Situation  |  X=Context  |  V=Verse \\par \\pard \\s16\\ql \\li0\\ri0\\widctlpar\\tqc\\tx4320\\tqr\\tx8640\\aspalpha\\aspnum\\faauto\\adjustright\\rin0\\lin0\\itap0 \\par\\f1\\fs14 Unless noted otherwise, Scripture quotations are from the Holy Bible, New International Version\\'ae (NIV\\'ae). Copyright \\'a9 2011 by Biblica Inc.\\'99 Used by permission. All rights reserved worldwide.  \\par }}`;
    }

    // Helper function to generate set header
    function generateSetHeader(roundName) {
        return `\\pard\\nowidctlpar\\qc\\b\\fs24 ${roundName}   \\b0\\fs15\\par \\par `;
    }

    // Helper function to get question type abbreviation
    function getTypeAbbreviation(type) {
        const typeMap = {
            'According-To': 'A',
            'General': 'G',
            'In-What-Book-and-Chapter': 'I',
            'Quote': 'Q',
            'Reference': 'R',
            'Situation': 'S',
            'Context': 'X',
            'Verse': 'V'
        };
        return typeMap[type] || 'G'; // Default to 'G' if type not found
    }

    // Helper function to format a single question
    function formatQuestion(question, questionNumber) {
        const typeAbbrev = getTypeAbbreviation(question.type);
        const questionText = question.question || '';
        const answerText = question.answer || '';
        
        return `\\pard\\fi-360\\li360\\f0\\fs15 ${typeAbbrev} \\tab ${questionNumber}. ${questionText} \\par\\tab A. ${answerText}  \\par \\par`;
    }

    // Helper function to generate column break (for multi-set files)
    function generateColumnBreak() {
        return `\\par \\column  `;
    }

    // Helper function to generate page break (if needed)
    function generatePageBreak() {
        return `\\par \\page `;
    }

    // Helper function to close RTF document
    function generateRTFFooter() {
        return `\\par }`;
    }

    // Build the RTF content
    let rtfContent = generateRTFHeader(sectionTag);

    // Process each set
    for (let setIndex = 0; setIndex < sets.length; setIndex++) {
        const roundName = roundNames[setIndex];
        const set = sets[setIndex];

        // Add set header
        rtfContent += generateSetHeader(roundName);

        // Add questions for this set
        for (let questionIndex = 0; questionIndex < set.length; questionIndex++) {
            const question = set[questionIndex];
            const questionNumber = questionIndex + 1;
            rtfContent += formatQuestion(question, questionNumber);
        }

        // Add column break between sets (except for the last set)
        if (setIndex < sets.length - 1) {
            rtfContent += generateColumnBreak();
        }
    }

    // Close the RTF document
    rtfContent += generateRTFFooter();

    return rtfContent;
}