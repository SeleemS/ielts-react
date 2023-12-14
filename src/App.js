import React, {useEffect} from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ReadingQuestion from './pages/ReadingQuestion';
import WritingQuestion from './pages/WritingQuestion';
import ListeningQuestion from './pages/ListeningQuestion';
import SpeakingQuestion from './pages/SpeakingQuestion';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import ContactUs from './pages/ContactUs';
import ReactGA from 'react-ga';
ReactGA.initialize('G-1KRYZZY68X');

const PageTracker = () => {
    const location = useLocation();
    
    useEffect(() => {
      ReactGA.pageview(location.pathname + location.search);
    }, [location]);
  
    return null; // This component doesn't render anything
  };


function App() {
  return (
      <Router>
        <PageTracker />
          <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/index.html" element={<HomePage />} />
              <Route path="/ielts-react/" element={<HomePage />} />
              <Route path="/ielts-react/readingquestion/:id" element={<ReadingQuestion />} />
              <Route path="/ielts-react/writingquestion/:id" element={<WritingQuestion />} />
              <Route path="/ielts-react/listeningquestion/:id" element={<ListeningQuestion />} />
              <Route path="/ielts-react/speakingquestion/:id" element={<SpeakingQuestion />} />
              <Route path="/privacypolicy/" element={<PrivacyPolicy />} />
              <Route path="/termsofservice/" element={<TermsOfService />} />
              <Route path="/contactus/" element={<ContactUs />} />

              {/* ... other routes */}
          </Routes>
      </Router>
  );
}

export default App;
