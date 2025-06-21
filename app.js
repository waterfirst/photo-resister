import React, { useState, useEffect, useRef } from 'react';

function App() {
  // 시뮬레이션 파라미터 상태 관리
  const [slitWidth, setSlitWidth] = useState(5); // 슬릿 너비 (nm)
  const [slitSpacing, setSlitSpacing] = useState(10); // 슬릿 간격 (nm)
  const [numSlits, setNumSlits] = useState(5); // 슬릿 개수
  const [isPlotlyLoaded, setIsPlotlyLoaded] = useState(false); // Plotly 로드 상태
  const [selectedPRType, setSelectedPRType] = useState('positive'); // 선택된 포토레지스트 타입: 'positive' 또는 'negative'

  // Plotly 그래프를 렌더링할 div 요소에 대한 참조 (이제 하나만 사용)
  const combinedPlotRef = useRef(null);

  // Plotly.js 스크립트를 동적으로 로드
  useEffect(() => {
    const loadPlotly = () => {
      // 이미 로드되었으면 다시 로드하지 않음
      if (window.Plotly) {
        setIsPlotlyLoaded(true);
        return;
      }

      // Plotly CDN 링크를 최신 안정 버전으로 업데이트합니다.
      const script = document.createElement('script');
      script.src = 'https://cdn.plot.ly/plotly-2.32.0.min.js'; // 최신 안정 버전으로 지정
      script.onload = () => {
        setIsPlotlyLoaded(true);
        console.log("Plotly.js loaded successfully.");
      };
      script.onerror = () => {
        console.error("Failed to load Plotly.js script.");
      };
      document.body.appendChild(script);

      return () => {
        // 컴포넌트 언마운트 시 스크립트 제거 (클린업)
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      };
    };

    loadPlotly();
  }, []); // 컴포넌트 마운트 시 한 번만 실행

  /**
   * Calculates light intensity based on given parameters.
   * Transformed from the calculate_intensity function in R Shiny code.
   * @param {number[]} position - Array of positions (nm) to calculate intensity for
   * @param {number} currentSlitWidth - Current slit width (nm)
   * @param {number} currentSlitSpacing - Current slit spacing (nm)
   * @param {number} currentNumSlits - Current number of slits
   * @returns {number[]} Array of calculated intensities
   */
  const calculateIntensity = (position, currentSlitWidth, currentSlitSpacing, currentNumSlits) => {
    if (currentNumSlits < 1) return Array(position.length).fill(0);

    // Calculate center positions of slits
    const centerPositions = Array.from({ length: currentNumSlits }, (_, i) => {
      return -((currentNumSlits - 1) / 2) * currentSlitSpacing + i * currentSlitSpacing;
    });

    // Initialize intensity array with zeros
    let intensity = new Array(position.length).fill(0);

    // Calculate intensity contribution for each slit
    for (let i = 0; i < currentNumSlits; i++) {
      const centerPos = centerPositions[i];
      // Outer slits have transmittance 1, inner slits add diffraction pattern
      if (i === 0 || i === currentNumSlits - 1) { 
        // Simple transmission model using Gaussian distribution
        intensity = intensity.map((val, idx) => val - Math.exp(-Math.pow((position[idx] - centerPos) / (currentSlitWidth / 2), 2)));
      } else {
        // Intensity calculation with diffraction effect
        intensity = intensity.map((val, idx) =>
          val - 1.2 * Math.exp(-Math.pow((position[idx] - centerPos) / (currentSlitWidth / 2), 2)) * (0.5 * Math.cos(Math.PI * (position[idx] - centerPos) / (currentSlitSpacing / 2)) + 0.5)
        );
      }
    }
    return intensity;
  };

  // 통합 플롯 렌더링/업데이트 useEffect
  useEffect(() => {
    // Render only if Plotly is loaded
    if (combinedPlotRef.current && isPlotlyLoaded && window.Plotly) {
      // 1. 빛의 강도 계산 및 데이터 준비
      const position = Array.from({ length: 1001 }, (_, i) => -50 + i * 0.1);
      const calculatedIntensity = calculateIntensity(position, slitWidth, slitSpacing, numSlits);
      // R Shiny 코드의 ylim(0, 1.5)를 따르도록 Math.max(0, ...) 적용
      const scaledIntensity = calculatedIntensity.map(val => Math.max(0, val * 0.8 + 1)); 

      const intensityData = {
        x: position,
        y: scaledIntensity,
        mode: 'lines',
        name: '빛의 강도',
        line: { color: 'rgb(255, 140, 0)', width: 2 }
      };

      // 2. 포토레지스트 패터닝 데이터 준비
      // PR 그래프를 빛의 강도 그래프 아래에 명확히 배치하기 위한 오프셋
      const prYOffset = -0.7; 
      const removedHeightNormalized = 0.05; // 제거된 PR의 최소 높이 (낮은 Y값, 정규화 후)
      const remainingHeightNormalized = 0.45; // 남아있는 PR의 최대 높이 (높은 Y값, 정규화 후)

      const minScaledIntensity = Math.min(...scaledIntensity);
      const maxScaledIntensity = Math.max(...scaledIntensity);

      let patternY;
      if (maxScaledIntensity - minScaledIntensity > 0.001) { // 0으로 나누는 것을 방지
        const normalizedIntensity = scaledIntensity.map(val =>
          (val - minScaledIntensity) / (maxScaledIntensity - minScaledIntensity)
        );

        if (selectedPRType === 'positive') {
          // Positive PR: Higher intensity -> lower height (removed)
          // normVal이 0일 때 remainingHeightNormalized, 1일 때 removedHeightNormalized
          patternY = normalizedIntensity.map(normVal => 
            (remainingHeightNormalized - (normVal * (remainingHeightNormalized - removedHeightNormalized))) + prYOffset
          );
        } else { // 'negative'
          // Negative PR: Higher intensity -> higher height (remains)
          // normVal이 0일 때 removedHeightNormalized, 1일 때 remainingHeightNormalized
          patternY = normalizedIntensity.map(normVal => 
            (removedHeightNormalized + (normVal * (remainingHeightNormalized - removedHeightNormalized))) + prYOffset
          );
        }
      } else {
        // 모든 강도가 동일하거나 거의 0인 경우 (슬릿이 없거나 매우 작을 때)
        patternY = scaledIntensity.map(() => (selectedPRType === 'positive' ? remainingHeightNormalized : removedHeightNormalized) + prYOffset);
      }

      const photoresistData = {
        x: position,
        y: patternY,
        mode: 'lines',
        line: { color: 'blue', width: 5 },
        name: `포토레지스트 (${selectedPRType === 'positive' ? '포지티브' : '네거티브'} PR)`,
      };

      // 3. 슬릿 패턴 도형 준비 (Y축 위치를 빛의 강도 그래프 위로 올림)
      const slitYOffset = 2.0; // 슬릿 패턴을 빛의 강도 그래프 위로 올릴 오프셋
      const slitRectHeight = 0.5; // 슬릿 rect의 원래 높이 절반

      const centerPositions = Array.from({ length: numSlits }, (_, i) => {
        return -((numSlits - 1) / 2) * slitSpacing + i * slitSpacing;
      });

      const slitShapes = centerPositions.map(centerPos => ({
        type: "rect",
        x0: centerPos - slitWidth / 2,
        y0: -slitRectHeight + slitYOffset, // 원래 Y 범위 (-0.5 ~ 0.5)를 오프셋
        x1: centerPos + slitWidth / 2,
        y1: slitRectHeight + slitYOffset,
        fillcolor: "black",
        line: { width: 0 },
        layer: 'below' // 슬릿을 그래프 아래에 그릴 수 있도록 설정 (선택 사항)
      }));

      // 4. 최종 데이터 및 레이아웃 설정
      const data = [intensityData, photoresistData];

      const layout = {
        title: {
          text: `노광 시뮬레이션: 광 분포 및 포토레지스트 패터닝 (${selectedPRType === 'positive' ? '포지티브' : '네거티브'} PR)`,
          font: { family: 'Inter, sans-serif' }
        },
        xaxis: { title: "위치 (nm)", automargin: true, range: [-50, 50] }, // X축 범위 고정
        // Y축 범위 조정: 슬릿, 강도, PR이 모두 보이도록
        // PR의 최대 Y값: 0.45 - 0.7 = -0.25 (가장 높을 때)
        // PR의 최소 Y값: 0.05 - 0.7 = -0.65 (가장 낮을 때)
        // 빛 강도 범위: 0 ~ 약 1.5
        // 슬릿 범위: 1.5 ~ 2.5
        yaxis: { title: "값 (상대 강도/패턴 높이)", range: [-0.7, 2.6], automargin: true }, 
        height: 600, // 전체 그래프 높이 증가
        margin: { l: 20, r: 20, t: 70, b: 20 },
        plot_bgcolor: '#f8f8f8',
        paper_bgcolor: '#f8f8f8',
        shapes: slitShapes, // 슬릿 도형들을 레이아웃에 추가
        showlegend: true,
      };

      window.Plotly.react(combinedPlotRef.current, data, layout);
    }
  }, [slitWidth, slitSpacing, numSlits, isPlotlyLoaded, selectedPRType]); // Dependencies for re-rendering

  return (
    // Apply Tailwind CSS for overall layout and styling.
    <div className="min-h-screen bg-gray-100 p-4 font-inter">
      {/* Tailwind CSS CDN script */}
      <script src="https://cdn.tailwindcss.com"></script>
      
      <style>
        {`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        /* Adjust z-index for Plotly modebar to be visible */
        .plotly .modebar {
          z-index: 1000;
        }
        /* Custom styling for tabs */
        .tab-button {
          @apply px-6 py-3 text-lg font-medium rounded-lg transition-colors duration-200 ease-in-out;
        }
        /* Positive PR active color */
        .tab-button.positive-active {
          @apply bg-blue-600 text-white shadow-lg;
        }
        /* Negative PR active color */
        .tab-button.negative-active {
          @apply bg-purple-600 text-white shadow-lg; /* 보라색 배경으로 변경 */
        }
        /* Inactive tab button color */
        .tab-button:not(.positive-active):not(.negative-active) {
          @apply bg-gray-200 text-gray-700 hover:bg-gray-300;
        }
        `}
      </style>

      <h1 className="text-4xl font-bold text-center mb-6 text-gray-800 rounded-lg p-2 bg-white shadow-md">
        노광 장비: Multi-slit 광 분포 및 패터닝 시뮬레이션
      </h1>

      <p className="text-lg text-gray-700 text-center mb-8 max-w-2xl mx-auto">
        이 시뮬레이션은 노광 장비에서 <strong className="text-blue-600">UV 빛이 슬릿 패턴을 통과할 때의 광 분포</strong>와
        이에 따라 <strong className="text-blue-600">포토레지스트가 어떻게 광 반응을 하여 패터닝되는지</strong>를 보여줍니다.
      </p>

      <div className="flex flex-col lg:flex-row gap-8 max-w-6xl mx-auto">
        {/* 시뮬레이션 파라미터 제어판 */}
        <div className="lg:w-1/3 bg-white p-6 rounded-lg shadow-xl border border-gray-200">
          <h2 className="text-2xl font-semibold mb-6 text-gray-800">시뮬레이션 파라미터</h2>
          <div className="mb-6">
            <label htmlFor="slit-width" className="block text-gray-700 text-lg font-medium mb-2">
              슬릿 너비 (nm): <span className="font-bold text-blue-600">{slitWidth}</span>
            </label>
            <input
              id="slit-width"
              type="range"
              min="1"
              max="10"
              value={slitWidth}
              onChange={(e) => setSlitWidth(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="slit-spacing" className="block text-gray-700 text-lg font-medium mb-2">
              슬릿 간격 (nm): <span className="font-bold text-blue-600">{slitSpacing}</span>
            </label>
            <input
              id="slit-spacing"
              type="range"
              min="5"
              max="20"
              value={slitSpacing}
              onChange={(e) => setSlitSpacing(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="num-slits" className="block text-gray-700 text-lg font-medium mb-2">
              슬릿 개수: <span className="font-bold text-blue-600">{numSlits}</span>
            </label>
            <input
              id="num-slits"
              type="number"
              min="1"
              value={numSlits}
              onChange={(e) => setNumSlits(Number(e.target.value))}
              className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 포토레지스트 타입 선택 버튼을 시뮬레이션 파라미터 섹션 안으로 이동 */}
          <div className="mb-6"> {/* 간격 조정을 위한 div */}
            <h3 className="text-xl font-semibold mb-3 text-gray-800">포토레지스트 타입</h3>
            <div className="flex justify-center space-x-2"> {/* 버튼들을 가로로 정렬 */}
              <button
                className={`tab-button ${selectedPRType === 'positive' ? 'positive-active' : ''}`}
                onClick={() => setSelectedPRType('positive')}
              >
                포지티브 PR
              </button>
              <button
                className={`tab-button ${selectedPRType === 'negative' ? 'negative-active' : ''}`}
                onClick={() => setSelectedPRType('negative')}
              >
                네거티브 PR
              </button>
            </div>
          </div>
        </div>

        {/* 통합된 그래프 플롯 영역 */}
        <div className="lg:w-2/3 bg-white p-4 rounded-lg shadow-xl border border-gray-200 flex items-center justify-center">
          <div id="combinedPlot" ref={combinedPlotRef} className="w-full h-full min-h-[600px]"></div>
          {!isPlotlyLoaded && (
            <p className="text-gray-500">그래프 로딩 중...</p>
          )}
        </div>
      </div>

      {/* 시뮬레이션 설명 */}
      <div className="mt-8 bg-white p-6 rounded-lg shadow-xl border border-gray-200 max-w-6xl mx-auto text-gray-800 leading-relaxed">
        <h3 className="text-2xl font-semibold mb-4 text-gray-800">시뮬레이션 설명:</h3>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <strong className="text-blue-600">슬릿 패턴</strong>: UV 빛이 통과하는 슬릿의 모양을 보여줍니다. 슬릿 너비, 간격, 개수를 조절하여 변경할 수 있습니다. 슬릿은 광 분포 그래프의 상단에 위치하여 빛이 시작되는 부분을 시각화합니다.
          </li>
          <li>
            <strong className="text-blue-600">빛의 강도 분포</strong>: 슬릿을 통과한 UV 빛이 회절 현상에 의해 어떻게 퍼져나가는지(광 분포)를 나타냅니다. Y축은 상대적인 빛의 강도를 나타냅니다.
            <ul className="list-circle list-inside ml-4">
              <li>
                <strong className="text-blue-600">외부 슬릿</strong>: 빛이 거의 그대로 투과되는 것으로 가정합니다.
              </li>
              <li>
                <strong className="text-blue-600">내부 슬릿</strong>: 회절 효과를 추가하여 빛의 간섭 패턴을 시뮬레이션합니다.
              </li>
            </ul>
          </li>
          <li>
            <strong className="text-blue-600">포토레지스트 패터닝</strong>: 계산된 빛의 강도 분포에 따라 포토레지스트가 광 반응을 일으켜 패터닝되는 과정을 시뮬레이션합니다. PR 형상은 광 분포 그래프 아래에 그려져 명확히 구분됩니다.
            <ul className="list-circle list-inside ml-4">
              <li>
                <strong className="text-blue-600">패터닝된 영역 (노출)</strong>: 빛의 강도가 특정 <code className="bg-gray-200 px-1 py-0.5 rounded text-red-600 font-mono">임계치 (threshold_intensity)</code> 이상인 영역을 표시합니다. 이 임계치를 넘는 부분은 포토레지스트가 반응하여 이후 공정에서 제거되거나 남게 됩니다.
              </li>
              <li>
                <strong className="text-blue-600">포토레지스트 (패터닝 후)</strong>: 노출된 영역과 노출되지 않은 영역을 시각적으로 구분하여 패터닝 결과를 보여줍니다.
                <ul className="list-circle list-inside ml-4">
                    <li><strong className="text-blue-600">포지티브(Positive) PR</strong>: 빛에 노출된 부분이 현상액에 녹아 없어집니다. (노출 강도↑ $\rightarrow$ 두께↓)</li>
                    <li><strong className="text-blue-600">네거티브(Negative) PR</strong>: 빛에 노출된 부분이 중합되어 현상액에 녹지 않고 남습니다. (노출 강도↑ $\rightarrow$ 두께↑)</li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
        <h3 className="text-2xl font-semibold mt-6 mb-4 text-gray-800">시뮬레이션 활용:</h3>
        <p>
          이 시뮬레이션을 통해 슬릿의 기하학적 구조가 UV 빛의 광 분포에 미치는 영향과,
          그 결과로 포토레지스트에 형성되는 미세 패턴의 변화를 직관적으로 이해할 수 있습니다.
          예를 들어, 슬릿의 간격이 좁아지거나 개수가 많아지면 빛의 간섭 패턴이 더욱 복잡해지며,
          이는 미세한 회로 패턴을 형성하는 데 중요한 영향을 미칩니다.
        </p>
      </div>
    </div>
  );
}

export default App;
