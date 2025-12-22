import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TravelAnimator from './components/TravelAnimator';
import { Toaster } from 'sonner';
import './App.css';

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TravelAnimator />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" />
    </>
  );
}

export default App;