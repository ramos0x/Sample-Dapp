import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Droplets, 
  Shield, 
  CheckCircle, 
  AlertTriangle,
  ExternalLink,
  Copy,
  Clock,
  Users,
  RefreshCw,
  Eye,
  EyeOff,
  Gift
} from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import { ThemeToggle } from './ThemeToggle';
import { useToast } from '@/hooks/use-toast';
import { sendFaucetTransaction, getFaucetStats, sendPrivateFaucetTransaction, getPrivateFaucetStats } from '../utils/faucet';

interface FaucetStats {
  totalClaimed: number;
  totalUsers: number;
  totalTransactions: number;
  faucetBalance: number;
  lastClaim: string | null;
}

interface PrivateFaucetStats {
  totalClaimed: number;
  totalUsers: number;
  totalTransactions: number;
  faucetBalance: string; // "Private OCT"
  lastClaim: string | null;
}

interface ClaimTimer {
  nextClaimTime: number | null;
  timeRemaining: string;
  isActive: boolean;
}

export function FaucetPage() {
  const [activeTab, setActiveTab] = useState('public');
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [stats, setStats] = useState<FaucetStats>({
    totalClaimed: 0,
    totalUsers: 0,
    totalTransactions: 0,
    faucetBalance: 0,
    lastClaim: null
  });
  const [privateStats, setPrivateStats] = useState<PrivateFaucetStats>({
    totalClaimed: 0,
    totalUsers: 0,
    totalTransactions: 0,
    faucetBalance: "Private OCT",
    lastClaim: null
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingPrivateStats, setIsLoadingPrivateStats] = useState(true);
  
  // Separate timers for public and private faucets
  const [publicTimer, setPublicTimer] = useState<ClaimTimer>({
    nextClaimTime: null,
    timeRemaining: '',
    isActive: false
  });
  
  const [privateTimer, setPrivateTimer] = useState<ClaimTimer>({
    nextClaimTime: null,
    timeRemaining: '',
    isActive: false
  });
  
  // Get current timer based on active tab
  const currentTimer = activeTab === 'public' ? publicTimer : privateTimer;
  const setCurrentTimer = activeTab === 'public' ? setPublicTimer : setPrivateTimer;
  
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const { toast } = useToast();

  // Use environment variable for reCAPTCHA site key
  const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  // Load timers from localStorage on component mount
  useEffect(() => {
    // Load public timer
    const savedPublicTimer = localStorage.getItem('faucet-timer-public');
    if (savedPublicTimer) {
      try {
        const parsed = JSON.parse(savedPublicTimer);
        const now = Math.floor(Date.now() / 1000);
        if (parsed.nextClaimTime && parsed.nextClaimTime > now) {
          setPublicTimer({
            nextClaimTime: parsed.nextClaimTime,
            timeRemaining: '',
            isActive: true
          });
        }
      } catch (error) {
        console.error('Failed to parse saved public timer:', error);
      }
    }
    
    // Load private timer
    const savedPrivateTimer = localStorage.getItem('faucet-timer-private');
    if (savedPrivateTimer) {
      try {
        const parsed = JSON.parse(savedPrivateTimer);
        const now = Math.floor(Date.now() / 1000);
        if (parsed.nextClaimTime && parsed.nextClaimTime > now) {
          setPrivateTimer({
            nextClaimTime: parsed.nextClaimTime,
            timeRemaining: '',
            isActive: true
          });
        }
      } catch (error) {
        console.error('Failed to parse saved private timer:', error);
      }
    }
  }, []);

  // Load stats from server on component mount
  useEffect(() => {
    loadStatsFromServer();
    loadPrivateStatsFromServer();
  }, []);

  // Timer effect for public faucet
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (publicTimer.isActive && publicTimer.nextClaimTime) {
      interval = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        const timeLeft = publicTimer.nextClaimTime! - now;

        if (timeLeft <= 0) {
          setPublicTimer(prev => ({
            ...prev,
            isActive: false,
            timeRemaining: '',
            nextClaimTime: null
          }));
          // Clear from localStorage
          localStorage.removeItem('faucet-timer-public');
        } else {
          const timeString = formatTimeRemaining(timeLeft);
          setPublicTimer(prev => ({
            ...prev,
            timeRemaining: timeString
          }));
        }
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [publicTimer.isActive, publicTimer.nextClaimTime]);

  // Timer effect for private faucet
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (privateTimer.isActive && privateTimer.nextClaimTime) {
      interval = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        const timeLeft = privateTimer.nextClaimTime! - now;

        if (timeLeft <= 0) {
          setPrivateTimer(prev => ({
            ...prev,
            isActive: false,
            timeRemaining: '',
            nextClaimTime: null
          }));
          // Clear from localStorage
          localStorage.removeItem('faucet-timer-private');
        } else {
          const timeString = formatTimeRemaining(timeLeft);
          setPrivateTimer(prev => ({
            ...prev,
            timeRemaining: timeString
          }));
        }
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [privateTimer.isActive, privateTimer.nextClaimTime]);

  // Save public timer to localStorage whenever it changes
  useEffect(() => {
    if (publicTimer.nextClaimTime) {
      localStorage.setItem('faucet-timer-public', JSON.stringify({
        nextClaimTime: publicTimer.nextClaimTime
      }));
    }
  }, [publicTimer.nextClaimTime]);

  // Save private timer to localStorage whenever it changes
  useEffect(() => {
    if (privateTimer.nextClaimTime) {
      localStorage.setItem('faucet-timer-private', JSON.stringify({
        nextClaimTime: privateTimer.nextClaimTime
      }));
    }
  }, [privateTimer.nextClaimTime]);

  const loadStatsFromServer = async () => {
    setIsLoadingStats(true);
    try {
      const serverStats = await getFaucetStats();
      setStats(serverStats);
    } catch (error) {
      console.error('Failed to load stats from server:', error);
      toast({
        title: "Warning",
        description: "Failed to load faucet statistics",
        variant: "destructive",
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const loadPrivateStatsFromServer = async () => {
    setIsLoadingPrivateStats(true);
    try {
      const serverStats = await getPrivateFaucetStats();
      setPrivateStats(serverStats);
    } catch (error) {
      console.error('Failed to load private stats from server:', error);
      toast({
        title: "Warning",
        description: "Failed to load private faucet statistics",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPrivateStats(false);
    }
  };

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return "Available now";
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const validateAddress = (addr: string): boolean => {
    return addr.startsWith('oct') && addr.length > 10;
  };

  const handleClaim = async () => {
    if (!address.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid Octra address",
        variant: "destructive",
      });
      return;
    }

    if (!validateAddress(address.trim())) {
      toast({
        title: "Error",
        description: "Invalid Octra address format. Address must start with 'oct'",
        variant: "destructive",
      });
      return;
    }

    const recaptchaValue = recaptchaRef.current?.getValue();
    if (!recaptchaValue) {
      toast({
        title: "Error",
        description: "Please complete the reCAPTCHA verification",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = activeTab === 'public' 
        ? await sendFaucetTransaction(address.trim(), recaptchaValue)
        : await sendPrivateFaucetTransaction(address.trim(), recaptchaValue);
      
      if (result.success) {
        // Extract clean hash from result
        let cleanHash = result.txHash;
        if (typeof cleanHash === 'string' && cleanHash.startsWith('{')) {
          try {
            const parsed = JSON.parse(cleanHash);
            cleanHash = parsed.tx_hash || cleanHash;
          } catch {
            if (typeof cleanHash === 'string') {
              const hashMatch = cleanHash.match(/"tx_hash":"([a-fA-F0-9]{64})"/);
              if (hashMatch) {
                cleanHash = hashMatch[1];
              }
            }
          }
        }
        
        setLastTxHash(cleanHash || null);
        const amount = activeTab === 'public' ? '10 OCT' : 'Surprise! 🎉';
        toast({
          title: "Success!",
          description: `Successfully sent ${amount} to your address!`,
        });
        
        // Set timer for next claim (24 hours)
        const nextClaimTime = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
        
        if (activeTab === 'public') {
          setPublicTimer({
            nextClaimTime,
            timeRemaining: formatTimeRemaining(24 * 60 * 60),
            isActive: true
          });
        } else {
          setPrivateTimer({
            nextClaimTime,
            timeRemaining: formatTimeRemaining(24 * 60 * 60),
            isActive: true
          });
        }
        
        // Reset form
        setAddress('');
        recaptchaRef.current?.reset();
        
        // Reload stats from server after successful claim
        if (activeTab === 'public') {
          await loadStatsFromServer();
        } else {
          await loadPrivateStatsFromServer();
        }
      } else {
        toast({
          title: "Claim Failed",
          description: result.error || "Failed to process faucet claim",
          variant: "destructive",
        });
        
        // If there's a nextClaimTime in the error response, set the timer
        if (result.nextClaimTime) {
          const timeRemaining = formatTimeRemaining(result.nextClaimTime - Math.floor(Date.now() / 1000));
          
          if (activeTab === 'public') {
            setPublicTimer({
              nextClaimTime: result.nextClaimTime,
              timeRemaining,
              isActive: true
            });
          } else {
            setPrivateTimer({
              nextClaimTime: result.nextClaimTime,
              timeRemaining,
              isActive: true
            });
          }
        }
      }
    } catch (error) {
      console.error('Faucet claim error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="octra-header sticky top-0 z-50">
        <div className="octra-container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-primary/10 border border-primary/20 rounded-full">
                  <Droplets className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Octra Faucet</h1>
                  <p className="text-sm text-muted-foreground">Free OCT tokens for testing</p>
                </div>
              </div>
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Non-Official
              </Badge>
            </div>

            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-4 text-sm text-muted-foreground">
                {isLoadingStats ? (
                  <div className="flex items-center space-x-1">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Loading...</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-1">
                      <Droplets className="h-4 w-4" />
                      <span>{stats.totalClaimed.toFixed(1)} OCT claimed</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Users className="h-4 w-4" />
                      <span>{stats.totalUsers} users</span>
                    </div>
                  </>
                )}
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Faucet Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-3xl flex items-center justify-center gap-3">
                  <Droplets className="h-8 w-8 text-primary" />
                  Claim Free OCT
                </CardTitle>
                <p className="text-muted-foreground">
                  Get free OCT tokens for testing on the Octra blockchain
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="public" className="flex items-center gap-2">
                      <Droplets className="h-4 w-4" />
                      Public Faucet
                    </TabsTrigger>
                    <TabsTrigger value="private" className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Private Faucet
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="public" className="space-y-6 mt-6">
                    <div className="text-center">
                      <p className="text-muted-foreground">
                        Get 10 OCT tokens for testing on the Octra blockchain
                      </p>
                    </div>
                    
                    {/* Address Input */}
                    <div className="space-y-2">
                      <Label htmlFor="address">Octra Address</Label>
                      <Input
                        id="address"
                        type="text"
                        placeholder="oct1234567890abcdef..."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="font-mono"
                        disabled={isLoading}
                      />
                      <p className="text-sm text-muted-foreground">
                        Enter your Octra wallet address (must start with 'oct')
                      </p>
                    </div>

                    {/* reCAPTCHA */}
                    {RECAPTCHA_SITE_KEY && (
                      <div className="flex justify-center">
                        <ReCAPTCHA
                          ref={recaptchaRef}
                          sitekey={RECAPTCHA_SITE_KEY}
                          theme="light"
                        />
                      </div>
                    )}

                    {!RECAPTCHA_SITE_KEY && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <AlertDescription>
                          reCAPTCHA is not configured. Please set VITE_RECAPTCHA_SITE_KEY in your environment variables.
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Next Claim Timer */}
                    {publicTimer.isActive && publicTimer.timeRemaining && (
                      <Alert>
                        <div className="flex items-start space-x-3">
                          <Clock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <AlertDescription>
                            Next claim available in: <strong>{publicTimer.timeRemaining}</strong>
                          </AlertDescription>
                        </div>
                      </Alert>
                    )}

                    {/* Claim Button */}
                    <Button 
                      onClick={handleClaim}
                      disabled={isLoading || !address.trim() || !RECAPTCHA_SITE_KEY || publicTimer.isActive}
                      className="w-full"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing...
                        </>
                      ) : publicTimer.isActive ? (
                        <>
                          <Clock className="h-4 w-4 mr-2" />
                          Next claim available in: {publicTimer.timeRemaining}
                        </>
                      ) : (
                        <>
                          <Droplets className="h-4 w-4 mr-2" />
                          Claim 10 OCT
                        </>
                      )}
                    </Button>
                  </TabsContent>

                  <TabsContent value="private" className="space-y-6 mt-6">
                    <div className="text-center space-y-2">
                      <div className="flex items-center justify-center gap-2">
                        <Shield className="h-5 w-5 text-purple-500" />
                        <span className="text-lg font-semibold text-purple-600 dark:text-purple-400">Private Transfer</span>
                      </div>
                      <p className="text-muted-foreground">
                        Get encrypted OCT tokens - amount is a surprise! 🎉
                      </p>
                      <div className="bg-purple-50 dark:bg-purple-950/20 p-3 rounded-lg border border-purple-200 dark:border-purple-800">
                        <p className="text-sm text-purple-700 dark:text-purple-300">
                          Private transfers use encrypted balance technology for enhanced privacy
                        </p>
                      </div>
                    </div>
                    
                    {/* Address Input */}
                    <div className="space-y-2">
                      <Label htmlFor="private-address">Octra Address</Label>
                      <Input
                        id="private-address"
                        type="text"
                        placeholder="oct1234567890abcdef..."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="font-mono"
                        disabled={isLoading}
                      />
                      <p className="text-sm text-muted-foreground">
                        Enter your Octra wallet address (must start with 'oct')
                      </p>
                    </div>

                    {/* reCAPTCHA */}
                    {RECAPTCHA_SITE_KEY && (
                      <div className="flex justify-center">
                        <ReCAPTCHA
                          ref={recaptchaRef}
                          sitekey={RECAPTCHA_SITE_KEY}
                          theme="light"
                        />
                      </div>
                    )}

                    {!RECAPTCHA_SITE_KEY && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          reCAPTCHA is not configured. Please set VITE_RECAPTCHA_SITE_KEY in your environment variables.
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Next Claim Timer */}
                    {privateTimer.isActive && privateTimer.timeRemaining && (
                      <Alert>
                        <div className="flex items-start space-x-3">
                          <Shield className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <AlertDescription>
                            Next private claim available in: <strong>{privateTimer.timeRemaining}</strong>
                          </AlertDescription>
                        </div>
                      </Alert>
                    )}

                    {/* Claim Button */}
                    <Button 
                      onClick={handleClaim}
                      disabled={isLoading || !address.trim() || !RECAPTCHA_SITE_KEY || privateTimer.isActive}
                      className="w-full bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing...
                        </>
                      ) : privateTimer.isActive ? (
                        <>
                          <Shield className="h-4 w-4 mr-2" />
                          Next claim available in: {privateTimer.timeRemaining}
                        </>
                      ) : (
                        <>
                          <Gift className="h-4 w-4 mr-2" />
                          Claim Surprise! 🎉
                        </>
                      )}
                    </Button>
                  </TabsContent>
                </Tabs>

                {/* Last Transaction - shown for both tabs */}
                {lastTxHash && (
                  <div className="p-4 bg-green-50 dark:bg-green-950/50 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mr-2 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-green-800 dark:text-green-200">
                          Transaction Successful!
                        </p>
                        <div className="mt-2">
                          <p className="text-green-700 dark:text-green-300 text-sm">Transaction Hash:</p>
                          <div className="flex items-center mt-1">
                            <code className="text-xs bg-green-100 dark:bg-green-900/50 px-2 py-1 rounded font-mono break-all text-green-800 dark:text-green-200">
                              {lastTxHash}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(lastTxHash, 'Transaction Hash')}
                              className="ml-2 h-6 w-6 p-0"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <a
                              href={`https://octrascan.io/tx/${lastTxHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                              title="View on OctraScan"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Stats Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-lg">Faucet Statistics</CardTitle>
                <div className="flex items-center gap-2">
                  {activeTab === 'public' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadStatsFromServer}
                      disabled={isLoadingStats}
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoadingStats ? 'animate-spin' : ''}`} />
                    </Button>
                  )}
                  {activeTab === 'private' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadPrivateStatsFromServer}
                      disabled={isLoadingPrivateStats}
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoadingPrivateStats ? 'animate-spin' : ''}`} />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {(activeTab === 'public' ? isLoadingStats : isLoadingPrivateStats) ? (
                  <div className="space-y-2">
                    <div className="h-4 bg-muted animate-pulse rounded"></div>
                    <div className="h-4 bg-muted animate-pulse rounded"></div>
                    <div className="h-4 bg-muted animate-pulse rounded"></div>
                  </div>
                ) : (
                  <>
                    {activeTab === 'public' ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Claimed:</span>
                          <span className="font-mono font-medium">{stats.totalClaimed.toFixed(1)} OCT</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Users:</span>
                          <span className="font-mono font-medium">{stats.totalUsers}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Transactions:</span>
                          <span className="font-mono font-medium">{stats.totalTransactions}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Faucet Balance:</span>
                          <span className="font-mono font-medium">{stats.faucetBalance.toFixed(1)} OCT</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Amount per Claim:</span>
                          <span className="font-mono font-medium">10 OCT</span>
                        </div>
                        {stats.lastClaim && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Last Claim:</span>
                            <span className="text-sm">{new Date(stats.lastClaim).toLocaleTimeString()}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Claimed:</span>
                          <span className="font-mono font-medium text-purple-600 dark:text-purple-400">Private OCT</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Users:</span>
                          <span className="font-mono font-medium">{privateStats.totalUsers}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Transactions:</span>
                          <span className="font-mono font-medium">{privateStats.totalTransactions}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Faucet Balance:</span>
                          <span className="font-mono font-medium text-purple-600 dark:text-purple-400">Private OCT</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Amount per Claim:</span>
                          <div className="flex items-center gap-1">
                            <span className="font-mono font-medium">Surprise</span>
                            <Gift className="h-4 w-4 text-yellow-500" />
                          </div>
                        </div>
                        {privateStats.lastClaim && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Last Claim:</span>
                            <span className="text-sm">{new Date(privateStats.lastClaim).toLocaleTimeString()}</span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator className="my-8" />

        {/* Footer */}
        <footer className="text-center text-sm text-muted-foreground">
          <div className="flex items-center justify-center gap-2 mb-2">
            <p>
              Donate your OCT here octAuNz35Tc3BfGurox4c82aZMLN3RvXDJ1T9HVTwqK7et1
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard('octAuNz35Tc3BfGurox4c82aZMLN3RvXDJ1T9HVTwqK7et1', 'Donation Address')}
              className="h-6 w-6 p-0"
              title="Copy donation address"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          {activeTab === 'private' && (
            <p className="mt-2 text-purple-600 dark:text-purple-400">
              Private transfers use encrypted balance technology for enhanced privacy.
            </p>
          )}
        </footer>
      </main>
    </div>
  );
}