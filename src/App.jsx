import React, { useState, useEffect } from 'react';

const INITIAL_BETO_PORTFOLIO = [
  { id: 'b1', owner: 'Beto', account: 'Computershare', type: 'Brokerage', shares: 832, costBasis: 23.47, warrants: 83 },
  { id: 'b2', owner: 'Beto', account: 'Webull', type: 'Brokerage', shares: 1961, costBasis: 26.23, warrants: 125 },
  { id: 'b3', owner: 'Beto', account: 'Fidelity', type: 'Brokerage', shares: 104, costBasis: 17.35, warrants: 10 },
  { id: 'b4', owner: 'Beto', account: 'SoFi', type: 'Brokerage', shares: 160, costBasis: 38.66, warrants: 16 },
  { id: 'b5', owner: 'Beto', account: 'Roth IRA', type: 'Retirement', shares: 499, costBasis: 24.36, warrants: 19 },
  { id: 'b6', owner: 'Beto', account: 'Traditional IRA', type: 'Retirement', shares: 264, costBasis: 22.67, warrants: 24 },
];

const INITIAL_CRISTINA_PORTFOLIO = [
  { id: 'c1', owner: 'Cristina', account: 'Fidelity', type: 'Brokerage', shares: 920, costBasis: 23.36, warrants: 92 },
  { id: 'c2', owner: 'Cristina', account: 'SoFi', type: 'Brokerage', shares: 452, costBasis: 37.17, warrants: 45 },
];

const FAMILY_BLENDED_COST = 26.07;

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [portfolio, setPortfolio] = useState(() => {
    const saved = localStorage.getItem('gmeTracker_portfolio');
    return saved ? JSON.parse(saved) : [...INITIAL_BETO_PORTFOLIO, ...INITIAL_CRISTINA_PORTFOLIO];
  });
  
  const [finnhubApiKey, setFinnhubApiKey] = useState(() => {
    return localStorage.getItem('gmeTracker_finnhubKey') || 'db7p9k9r01qmvbh1ugrgdb7p9k9r01qmvbh1ugs0';
  });
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(() => Number(localStorage.getItem('gmeTracker_refreshInterval')) || 1);

  const [livePrice, setLivePrice] = useState(() => {
    const saved = localStorage.getItem('gmeTracker_lastKnownPrice');
    return saved ? parseFloat(saved) : FAMILY_BLENDED_COST;
  });
  
  const [scenarioPrice, setScenarioPrice] = useState(livePrice);
  const [isScenarioMode, setIsScenarioMode] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [apiStatus, setApiStatus] = useState('Disconnected');
  const [apiErrorMsg, setApiErrorMsg] = useState('');

  const [taxSettings, setTaxSettings] = useState({
    capitalGainsRate: 15,
    stateTaxRate: 4.95,
    sellingFees: 0
  });

  const [selectedSaleAccount, setSelectedSaleAccount] = useState('all');
  const [saleQuantity, setSaleQuantity] = useState('');

  useEffect(() => {
    localStorage.setItem('gmeTracker_portfolio', JSON.stringify(portfolio));
    localStorage.setItem('gmeTracker_refreshInterval', autoRefreshInterval);
    localStorage.setItem('gmeTracker_finnhubKey', finnhubApiKey);
    if (apiStatus === 'Connected') {
      localStorage.setItem('gmeTracker_lastKnownPrice', livePrice);
    }
  }, [portfolio, livePrice, apiStatus, autoRefreshInterval, finnhubApiKey]);

  const fetchLivePrice = async () => {
    try {
      setApiStatus('Fetching...');
      setApiErrorMsg('');
      const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=GME&token=${finnhubApiKey}`);
      
      if (!response.ok) {
        if (response.status === 401) throw new Error('Unauthorized: Invalid Finnhub API Key');
        if (response.status === 429) throw new Error('Rate limit exceeded (Max 60/min)');
        throw new Error(`API Error: ${response.status}`);
      }
      
      const data = await response.json();
      if (data && data.c && data.c > 0) {
        setLivePrice(data.c);
        const timestampMs = data.t ? data.t * 1000 : Date.now();
        setLastUpdated(new Date(timestampMs).toLocaleTimeString());
        setApiStatus('Connected');
        if (!isScenarioMode) setScenarioPrice(data.c);
      } else {
        throw new Error('Invalid or empty quote response');
      }
    } catch (error) {
      setApiStatus('Error');
      setApiErrorMsg(error.message);
    }
  };

  useEffect(() => {
    fetchLivePrice();
    if (autoRefreshInterval > 0) {
      const interval = setInterval(fetchLivePrice, autoRefreshInterval * 60000);
      return () => clearInterval(interval);
    }
  }, [autoRefreshInterval, finnhubApiKey]);

  const currentPrice = isScenarioMode ? scenarioPrice : livePrice;

  const calculateMetrics = (holdings) => {
    const shares = holdings.reduce((sum, item) => sum + item.shares, 0);
    const warrants = holdings.reduce((sum, item) => sum + item.warrants, 0);
    const costBasis = holdings.reduce((sum, item) => sum + (item.shares * item.costBasis), 0);
    const marketValue = shares * currentPrice;
    const grossProfit = marketValue - costBasis;
    const profitPercent = costBasis > 0 ? (grossProfit / costBasis) * 100 : 0;
    return { shares, warrants, costBasis, marketValue, grossProfit, profitPercent };
  };

  const betoBrokerage = portfolio.filter(p => p.owner === 'Beto' && p.type === 'Brokerage');
  const betoRetirement = portfolio.filter(p => p.owner === 'Beto' && p.type === 'Retirement');
  const cristinaHoldings = portfolio.filter(p => p.owner === 'Cristina');
  
  const betoBrokMetrics = calculateMetrics(betoBrokerage);
  const betoRetMetrics = calculateMetrics(betoRetirement);
  const betoTotalMetrics = calculateMetrics(portfolio.filter(p => p.owner === 'Beto'));
  const cristinaMetrics = calculateMetrics(cristinaHoldings);
  const householdMetrics = calculateMetrics(portfolio);

  const estimatedTax = Math.max(0, householdMetrics.grossProfit) * ((taxSettings.capitalGainsRate + taxSettings.stateTaxRate) / 100);
  const netProceeds = householdMetrics.marketValue - estimatedTax - taxSettings.sellingFees;

  const formatCur = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
  const formatNum = (val) => new Intl.NumberFormat('en-US').format(val || 0);
  const formatPct = (val) => `${(val > 0 ? '+' : '')}${val.toFixed(2)}%`;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans p-4 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div>
            <h1 className="text-2xl font-bold text-white">GME Wealth Tracker</h1>
            <div className="text-sm text-gray-400 mt-1 flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${apiStatus === 'Connected' ? 'bg-green-500' : 'bg-red-500'}`}></span>
              {isScenarioMode ? 'SCENARIO MODE' : `Live Data: ${apiStatus}`}
              {lastUpdated && !isScenarioMode && <span className="ml-2">| Last: {lastUpdated}</span>}
            </div>
            {apiErrorMsg && <div className="text-xs text-red-400 mt-1">{apiErrorMsg}</div>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={`text-3xl font-mono font-bold ${isScenarioMode ? 'text-purple-400' : 'text-green-400'}`}>
              {formatCur(currentPrice)}
            </div>
            <button onClick={fetchLivePrice} className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded" disabled={isScenarioMode}>
              Refresh Quote
            </button>
          </div>
        </div>

        <div className="flex space-x-2 border-b border-gray-700 pb-2">
          {['dashboard', 'calculator', 'settings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === tab ? 'bg-gray-800 text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:bg-gray-800'}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="text-sm text-gray-400">Total Shares</div>
                <div className="text-xl font-bold">{formatNum(householdMetrics.shares)}</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="text-sm text-gray-400">Avg Cost Basis</div>
                <div className="text-xl font-bold">{formatCur(householdMetrics.costBasis / householdMetrics.shares)}</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="text-sm text-gray-400">Total Inv. Value</div>
                <div className="text-xl font-bold">{formatCur(householdMetrics.costBasis)}</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="text-sm text-gray-400">Market Value</div>
                <div className="text-xl font-bold text-blue-400">{formatCur(householdMetrics.marketValue)}</div>
              </div>
            </div>

            <div className={`p-6 rounded-lg border ${householdMetrics.grossProfit >= 0 ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-800'}`}>
              <div className="text-center">
                <div className="text-sm text-gray-300 mb-1">Household Unrealized P/L</div>
                <div className={`text-4xl font-bold mb-2 ${householdMetrics.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {householdMetrics.grossProfit >= 0 ? '+' : ''}{formatCur(householdMetrics.grossProfit)}
                </div>
                <div className={`text-lg font-medium ${householdMetrics.grossProfit >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {formatPct(householdMetrics.profitPercent)}
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="p-4 bg-gray-750 border-b border-gray-700 font-bold text-lg">Portfolio Breakdown</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-900 text-gray-400 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3 text-right">Shares</th>
                      <th className="px-4 py-3 text-right">Cost/Sh</th>
                      <th className="px-4 py-3 text-right">Market Val</th>
                      <th className="px-4 py-3 text-right">Unrealized P/L</th>
                      <th className="px-4 py-3 text-right">Gain/Loss %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    <tr className="bg-gray-800/80"><td colSpan="6" className="px-4 py-2 font-bold text-blue-300">BETO, Brokerage</td></tr>
                    {betoBrokerage.map(p => {
                      const mVal = p.shares * currentPrice;
                      const cost = p.shares * p.costBasis;
                      const pl = mVal - cost;
                      const plPct = (pl / cost) * 100;
                      return (
                        <tr key={p.id} className="hover:bg-gray-700">
                          <td className="px-4 py-3">{p.account}</td>
                          <td className="px-4 py-3 text-right">{formatNum(p.shares)}</td>
                          <td className="px-4 py-3 text-right">{formatCur(p.costBasis)}</td>
                          <td className="px-4 py-3 text-right">{formatCur(mVal)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pl > 0 ? '+' : ''}{formatCur(pl)}</td>
                          <td className={`px-4 py-3 text-right ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPct(plPct)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-900/50 font-semibold text-gray-300">
                      <td className="px-4 py-2 text-right">Brokerage Subtotal:</td>
                      <td className="px-4 py-2 text-right">{formatNum(betoBrokMetrics.shares)}</td>
                      <td className="px-4 py-2 text-right"></td>
                      <td className="px-4 py-2 text-right">{formatCur(betoBrokMetrics.marketValue)}</td>
                      <td className={`px-4 py-2 text-right ${betoBrokMetrics.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCur(betoBrokMetrics.grossProfit)}</td>
                      <td className={`px-4 py-2 text-right ${betoBrokMetrics.profitPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPct(betoBrokMetrics.profitPercent)}</td>
                    </tr>
                    <tr className="bg-gray-800/80 border-t border-gray-600"><td colSpan="6" className="px-4 py-2 font-bold text-blue-300">BETO, Retirement</td></tr>
                    {betoRetirement.map(p => {
                      const mVal = p.shares * currentPrice;
                      const cost = p.shares * p.costBasis;
                      const pl = mVal - cost;
                      const plPct = (pl / cost) * 100;
                      return (
                        <tr key={p.id} className="hover:bg-gray-700">
                          <td className="px-4 py-3">{p.account}</td>
                          <td className="px-4 py-3 text-right">{formatNum(p.shares)}</td>
                          <td className="px-4 py-3 text-right">{formatCur(p.costBasis)}</td>
                          <td className="px-4 py-3 text-right">{formatCur(mVal)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pl > 0 ? '+' : ''}{formatCur(pl)}</td>
                          <td className={`px-4 py-3 text-right ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPct(plPct)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-900/50 font-semibold text-gray-300">
                      <td className="px-4 py-2 text-right">Retirement Subtotal:</td>
                      <td className="px-4 py-2 text-right">{formatNum(betoRetMetrics.shares)}</td>
                      <td className="px-4 py-2 text-right"></td>
                      <td className="px-4 py-2 text-right">{formatCur(betoRetMetrics.marketValue)}</td>
                      <td className={`px-4 py-2 text-right ${betoRetMetrics.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCur(betoRetMetrics.grossProfit)}</td>
                      <td className={`px-4 py-2 text-right ${betoRetMetrics.profitPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPct(betoRetMetrics.profitPercent)}</td>
                    </tr>
                    <tr className="bg-blue-900/20 font-bold text-white border-t-2 border-gray-600">
                      <td className="px-4 py-3 text-right">BETO TOTAL:</td>
                      <td className="px-4 py-3 text-right">{formatNum(betoTotalMetrics.shares)}</td>
                      <td className="px-4 py-3 text-right"></td>
                      <td className="px-4 py-3 text-right">{formatCur(betoTotalMetrics.marketValue)}</td>
                      <td className={`px-4 py-3 text-right ${betoTotalMetrics.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCur(betoTotalMetrics.grossProfit)}</td>
                      <td className={`px-4 py-3 text-right ${betoTotalMetrics.profitPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPct(betoTotalMetrics.profitPercent)}</td>
                    </tr>
                    <tr className="bg-gray-800/80 border-t-4 border-gray-900"><td colSpan="6" className="px-4 py-2 font-bold text-pink-300">CRISTINA, Brokerage</td></tr>
                    {cristinaHoldings.map(p => {
                      const mVal = p.shares * currentPrice;
                      const cost = p.shares * p.costBasis;
                      const pl = mVal - cost;
                      const plPct = (pl / cost) * 100;
                      return (
                        <tr key={p.id} className="hover:bg-gray-700">
                          <td className="px-4 py-3">{p.account}</td>
                          <td className="px-4 py-3 text-right">{formatNum(p.shares)}</td>
                          <td className="px-4 py-3 text-right">{formatCur(p.costBasis)}</td>
                          <td className="px-4 py-3 text-right">{formatCur(mVal)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pl > 0 ? '+' : ''}{formatCur(pl)}</td>
                          <td className={`px-4 py-3 text-right ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPct(plPct)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-pink-900/20 font-bold text-white border-t-2 border-gray-600">
                      <td className="px-4 py-3 text-right">CRISTINA TOTAL:</td>
                      <td className="px-4 py-3 text-right">{formatNum(cristinaMetrics.shares)}</td>
                      <td className="px-4 py-3 text-right"></td>
                      <td className="px-4 py-3 text-right">{formatCur(cristinaMetrics.marketValue)}</td>
                      <td className={`px-4 py-3 text-right ${cristinaMetrics.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCur(cristinaMetrics.grossProfit)}</td>
                      <td className={`px-4 py-3 text-right ${cristinaMetrics.profitPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPct(cristinaMetrics.profitPercent)}</td>
                    </tr>
                    <tr className="bg-gray-700 font-black text-white border-t-4 border-gray-900 text-base">
                      <td className="px-4 py-4 text-right">HOUSEHOLD TOTAL:</td>
                      <td className="px-4 py-4 text-right">{formatNum(householdMetrics.shares)}</td>
                      <td className="px-4 py-4 text-right">{formatCur(householdMetrics.costBasis / householdMetrics.shares)}</td>
                      <td className="px-4 py-4 text-right text-blue-300">{formatCur(householdMetrics.marketValue)}</td>
                      <td className={`px-4 py-4 text-right ${householdMetrics.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCur(householdMetrics.grossProfit)}</td>
                      <td className={`px-4 py-4 text-right ${householdMetrics.profitPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPct(householdMetrics.profitPercent)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'calculator' && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg border border-purple-800 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold text-purple-400 mb-2">Scenario Planner</h2>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-300">Toggle Mode:</label>
                    <button 
                      onClick={() => {
                        setIsScenarioMode(!isScenarioMode);
                        if(isScenarioMode) setScenarioPrice(livePrice);
                      }}
                      className={`px-4 py-1.5 rounded text-sm font-bold transition-colors ${isScenarioMode ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                    >
                      {isScenarioMode ? 'SCENARIO ACTIVE' : 'USE LIVE PRICE'}
                    </button>
                  </div>
                </div>
                {isScenarioMode && (
                  <div className="text-right">
                    <label className="block text-sm text-gray-400 mb-1">Hypothetical Share Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-400">$</span>
                      <input 
                        type="number" 
                        value={scenarioPrice}
                        onChange={(e) => setScenarioPrice(Number(e.target.value))}
                        className="bg-gray-900 border border-gray-600 rounded pl-8 pr-4 py-2 w-32 text-white font-mono text-lg focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {isScenarioMode && (
                <div className="flex flex-wrap gap-2 mb-6 border-t border-gray-700 pt-4">
                  <span className="text-sm text-gray-400 py-1">Quick Scenarios:</span>
                  {[20, 30, 50, 100, 200, 500].map(price => (
                    <button 
                      key={price}
                      onClick={() => setScenarioPrice(price)}
                      className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm font-mono"
                    >
                      ${price}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-900 p-4 rounded border border-gray-700">
                <div>
                  <h3 className="text-gray-400 text-sm mb-4 border-b border-gray-800 pb-2">Full Liquidation Estimate</h3>
                  <div className="space-y-3 font-mono text-sm">
                    <div className="flex justify-between">
                      <span>Gross Proceeds:</span>
                      <span className="text-white">{formatCur(householdMetrics.marketValue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Less Cost Basis:</span>
                      <span className="text-gray-400">-{formatCur(householdMetrics.costBasis)}</span>
                    </div>
                    <div className="flex justify-between text-green-400">
                      <span>Realized Gain:</span>
                      <span>{formatCur(householdMetrics.grossProfit)}</span>
                    </div>
                    <div className="flex justify-between text-red-400">
                      <span>Est. Taxes:</span>
                      <span>-{formatCur(estimatedTax)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg text-blue-400 pt-1 border-t border-gray-700">
                      <span>NET TAKE-HOME:</span>
                      <span>{formatCur(netProceeds)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                  <h3 className="text-gray-300 font-bold mb-4">Partial Sale Estimator</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Select Lot / Account</label>
                      <select 
                        className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white"
                        value={selectedSaleAccount}
                        onChange={(e) => {
                          setSelectedSaleAccount(e.target.value);
                          setSaleQuantity('');
                        }}
                      >
                        <option value="all">Household Blended Pool</option>
                        {portfolio.map(p => (
                          <option key={p.id} value={p.id}>{p.owner}, {p.account} ({p.shares} sh)</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Shares to Sell</label>
                      <input 
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={saleQuantity}
                        onChange={(e) => setSaleQuantity(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                      />
                    </div>
                    {saleQuantity > 0 && (() => {
                      const qty = Number(saleQuantity);
                      let targetCostPerShare = householdMetrics.costBasis / householdMetrics.shares;
                      let maxShares = householdMetrics.shares;

                      if (selectedSaleAccount !== 'all') {
                        const acc = portfolio.find(p => p.id === selectedSaleAccount);
                        if (acc) {
                          targetCostPerShare = acc.costBasis;
                          maxShares = acc.shares;
                        }
                      }

                      if (qty > maxShares) return <div className="text-red-400 text-sm">Error: Quantity exceeds available shares.</div>;

                      const saleGross = qty * currentPrice;
                      const saleCost = qty * targetCostPerShare;
                      const saleGain = saleGross - saleCost;
                      const saleGainPct = (saleGain / saleCost) * 100;
                      const saleTax = Math.max(0, saleGain) * ((taxSettings.capitalGainsRate + taxSettings.stateTaxRate) / 100);
                      const saleNet = saleGross - saleTax;

                      return (
                        <div className="bg-gray-900 p-3 rounded text-sm font-mono space-y-2 mt-4 border border-gray-700">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Orig. Cost/Share:</span>
                            <span>{formatCur(targetCostPerShare)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Net Diff/Share:</span>
                            <span className={currentPrice - targetCostPerShare >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {formatCur(currentPrice - targetCostPerShare)}
                            </span>
                          </div>
                          <div className="border-b border-gray-700 my-2"></div>
                          <div className="flex justify-between">
                            <span>Gross Proceeds:</span>
                            <span>{formatCur(saleGross)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Realized Gain:</span>
                            <span className={saleGain >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {formatCur(saleGain)} ({formatPct(saleGainPct)})
                            </span>
                          </div>
                          <div className="flex justify-between font-bold text-blue-400 pt-1 border-t border-gray-700">
                            <span>NET CASH:</span>
                            <span>{formatCur(saleNet)}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 space-y-4">
            <h2 className="text-xl font-bold mb-4">Tax & API Defaults</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Cap Gains Rate (%)</label>
                <input 
                  type="number" 
                  value={taxSettings.capitalGainsRate}
                  onChange={(e) => setTaxSettings({...taxSettings, capitalGainsRate: Number(e.target.value)})}
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">State Tax Rate (%)</label>
                <input 
                  type="number" 
                  value={taxSettings.stateTaxRate}
                  onChange={(e) => setTaxSettings({...taxSettings, stateTaxRate: Number(e.target.value)})}
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                />
              </div>
              <div className="md:col-span-2 border-t border-gray-700 pt-4">
                <label className="block text-sm text-gray-400 mb-1">Finnhub API Key</label>
                <input 
                  type="text" 
                  value={finnhubApiKey}
                  onChange={(e) => setFinnhubApiKey(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white font-mono text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
