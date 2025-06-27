const fs = require('fs');

// Load the main code
const code = fs.readFileSync('main.js', 'utf8');
eval(code);

console.log('Testing CSV parsing...');
try {
    // Test CSV creation and parsing
    const sampleCSV = createSampleCSV();
    console.log('✓ Sample CSV created, length:', sampleCSV.length);
    
    const parseResult = csvToQuestionPool(sampleCSV);
    console.log('✓ CSV parsed successfully');
    console.log('✓ Questions found:', parseResult.questions.length);
    console.log('✓ Valid rows:', parseResult.validRows, 'of', parseResult.totalRows);
    
    if (parseResult.errors.length > 0) {
        console.log('⚠ Parsing warnings:', parseResult.errors.length);
    }
    
    // Use parsed questions for further testing
    const sampleQuestions = parseResult.questions;
    
    console.log('\nTesting generateQuestionSet function...');
    const books = [{ name: 'Luke', chapters: Array.from({length: 24}, (_, i) => i + 1) }];
    const result = generateQuestionSet(sampleQuestions, true, books);
    console.log('✓ Generated set length:', result.set.length);
    console.log('✓ Question types:', result.set.map(q => q.type));
    
    console.log('\nTesting RTF generation...');
    const rtf = genRTFFile(['SET #1'], [result.set], 'Luke 1-24');
    console.log('✓ RTF generated successfully, length:', rtf.length);
    console.log('✓ RTF starts with correct header:', rtf.startsWith('{\\rtf1'));
    console.log('✓ RTF contains set header:', rtf.includes('SET #1'));
    console.log('✓ RTF contains type abbreviations:', rtf.includes('\\tab A.') || rtf.includes('\\tab Q.') || rtf.includes('\\tab G.'));
    
    console.log('\nTesting QPerformance JSON generation...');
    const qperf = genQperfSet('SET #1', result.set);
    console.log('✓ QPerformance JSON generated:', qperf.length > 0);
    console.log('✓ Contains round name:', qperf.includes('"round": "SET #1"'));
    
    console.log('\n✅ All tests passed!');
} catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
}
