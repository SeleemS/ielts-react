import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ReadingQuestion from './pages/ReadingQuestion';
import WritingQuestion from './pages/WritingQuestion';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';

function App() {
  return (
      <Router>
          <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/readingquestion/:id" element={<ReadingQuestion />} />
              <Route path="/writingquestion/:id" element={<WritingQuestion />} />
              <Route path="/privacypolicy/" element={<PrivacyPolicy />} />
                <Route path="/termsofservice/" element={<TermsOfService />} />
              {/* ... other routes */}
          </Routes>
      </Router>
  );
}

export default App;
