const fs = require('fs');

// Load the main code
const code = fs.readFileSync('main.js', 'utf8');
eval(code);

// Sample questions for testing
const sampleQuestions = [
    {type: 'General', question: 'Who were praying outside?', answer: 'All the assembled worshipers (Luke 1:10)', reference: 'Luke 1:10'},
    {type: 'According-To', question: 'According to Luke, chapter 14, verse 9, what will the host say to you?', answer: 'Give this person your seat. (Luke 14:9)', reference: 'Luke 14:9'},
    {type: 'Quote', question: 'Quote Luke, chapter 6, verses 22 through 23.', answer: 'Blessed are you when people hate you... (Luke 6:22-23)', reference: 'Luke 6:22-23'},
    {type: 'Reference', question: 'Finish these verses and give the reference: "While they were there, the..."', answer: '...time came for the baby to be born... (Luke 2:6-7)', reference: 'Luke 2:6-7'},
    {type: 'Situation', question: 'Situation question: who said it, to whom: "Go tell that fox..."', answer: 'Jesus said it to some Pharisees... (Luke 13:31-32)', reference: 'Luke 13:31-32'},
];

console.log('Testing generateQuestionSet function...');
try {
    const result = generateQuestionSet(sampleQuestions, 5, {});
    console.log('✓ Generated set length:', result.set.length);
    console.log('✓ Question types:', result.set.map(q => q.type));
    
    console.log('\nTesting RTF generation...');
    const rtf = genRTFFile(['SET #1'], [result.set], 'Luke 1-20');
    console.log('✓ RTF generated successfully, length:', rtf.length);
    console.log('✓ RTF starts with correct header:', rtf.startsWith('{\\rtf1'));
    console.log('✓ RTF contains set header:', rtf.includes('SET #1'));
    console.log('✓ RTF contains type abbreviations:', rtf.includes('\\tab A.') && rtf.includes('\\tab Q.') && rtf.includes('\\tab G.'));
    
    console.log('\nTesting QPerformance JSON generation...');
    const qperf = genQperfSet('SET #1', result.set);
    console.log('✓ QPerformance JSON generated:', qperf.length > 0);
    console.log('✓ Contains round name:', qperf.includes('"round": "SET #1"'));
    
    console.log('\n✅ All tests passed!');
} catch (error) {
    console.error('❌ Test failed:', error.message);
}
