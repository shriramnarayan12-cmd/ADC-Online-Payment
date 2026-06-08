import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase'; 
import { CreditCard, CheckCircle2, AlertCircle, X, Globe, MapPin } from 'lucide-react';

// ==========================================
// --- ONLINE PORTAL CONFIGURATION ---
// ==========================================

const ONLINE_BATCHES = [
  { name: "AOB MON 12PM Medha", fee: 500, currency: "INR" },
  { name: "AOB MON 8:30PM Medha", fee: 1500, currency: "INR" },
  { name: "AOB WED 11AM INDU", fee: 1000, currency: "INR" },
  { name: "AOB WED 10AM INDU", fee: 1000, currency: "INR" },
  { name: "AOK WED 8:30PM Maanvi", fee: 1200, currency: "INR" },
  { name: "AOK WED 7:30PM Maanvi", fee: 500, currency: "INR" },
  { name: "AOK FRI 6AM Maanvi", fee: 50, currency: "USD" },
  { name: "AOK FRI 8PM Maanvi", fee: 1500, currency: "INR" }
];

const INR_BANK_DETAILS = {
  bank: "ICICI Bank",
  name: "TUMKUR DWARAKANATH RAJENDRA",
  account: "6254 0502 1335",
  ifsc: "ICIC0006254",
  upi: "ENTER_UPI_ID_HERE@upi", // <-- TODO: Update UPI ID
  qrBase64: "data:image/png;base64,PLACEHOLDER_INDIAN_QR_HERE", // <-- TODO: Update QR
  fileName: "ADC_ICICI_QR.png"
};

const USD_BANK_DETAILS = {
  bank: "Wells Fargo Bank",
  name: "Rajendra Tumkur Dwarakanath",
  account: "2195164773",
  routing: "ENTER_ROUTING_NUMBER_HERE" // <-- TODO: Update Routing/Swift
};

const ZELLE_DETAILS = {
  email: "nirupamarajendra@gmail.com",
  instruction: "Please transfer the total amount via Zelle to the email address below."
};

const PAYPAL_DETAILS = {
  handlingFee: 6,
  qrBase64: "data:image/png;base64,PLACEHOLDER_PAYPAL_QR_HERE", // <-- TODO: Update PayPal QR
  fileName: "ADC_PayPal_QR.png"
};

// ==========================================

interface Student {
  id: string;
  reg_no: string;
  name: string;
  batch_name: string;
}

interface FormData {
  batch_name: string;
  reg_no: string;
  txn_id: string;
  usd_payment_method: 'Bank' | 'Zelle' | 'PayPal';
}

export default function App() {
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceCount, setAttendanceCount] = useState<number>(0);
  
  const [formData, setFormData] = useState<FormData>({
    batch_name: '',
    reg_no: '',
    txn_id: '',
    usd_payment_method: 'Bank'
  });

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<any>(null);

  // 1. Get Selected Batch Object & Currency
  const selectedBatchObj = useMemo(() => {
    return ONLINE_BATCHES.find(b => b.name === formData.batch_name) || null;
  }, [formData.batch_name]);

  const selectedStudent = useMemo(() => {
    return students.find(s => s.reg_no === formData.reg_no) || null;
  }, [students, formData.reg_no]);

  // 2. Fetch Students for Selected Batch
  useEffect(() => {
    const fetchStudents = async () => {
      if (!formData.batch_name) {
        setStudents([]);
        return;
      }
      setLoading(true);
      try {
        const q = query(collection(db, 'students'), where('batch_name', '==', formData.batch_name));
        const querySnapshot = await getDocs(q);
        const fetchedStudents: Student[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.isArchived !== true) {
            fetchedStudents.push({
              id: doc.id,
              reg_no: data.reg_no,
              name: data.name,
              batch_name: data.batch_name
            });
          }
        });
        setStudents(fetchedStudents.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err) {
        console.error("Error fetching students:", err);
        setError("Failed to fetch students. Check connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
    setFormData(prev => ({ ...prev, reg_no: '', txn_id: '' }));
  }, [formData.batch_name]);

  // 3. Fetch Attendance & Calculate for Current Month
  useEffect(() => {
    const fetchAttendance = async () => {
      if (!formData.batch_name || !formData.reg_no) {
        setAttendanceCount(0);
        return;
      }
      
      setLoading(true);
      try {
        const currentMonthPrefix = new Date().toISOString().substring(0, 7); // e.g., "2026-06"
        
        const q = query(collection(db, 'attendance'), where('batch_name', '==', formData.batch_name));
        const querySnapshot = await getDocs(q);
        
        let presentCount = 0;
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // Filter strictly for the current month and valid session types
          if (data.date && data.date.startsWith(currentMonthPrefix)) {
            const type = (data.sessionType || "Regular").trim();
            if (type === "Regular" || type === "Re-Scheduled") {
              if (data.presentStudents && data.presentStudents.includes(formData.reg_no)) {
                presentCount++;
              }
            }
          }
        });
        
        setAttendanceCount(presentCount);
      } catch (err) {
        console.error("Error fetching attendance:", err);
        setError("Failed to calculate attendance. Check connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [formData.batch_name, formData.reg_no]);

  // 4. Clean Fee Calculation
  const calculation = useMemo(() => {
    if (!selectedBatchObj || !selectedStudent) return { base: 0, total: 0, currency: 'INR', symbol: '₹' };
    
    const base = attendanceCount * selectedBatchObj.fee;
    let total = base;
    
    // Add PayPal Handling Fee if selected
    if (selectedBatchObj.currency === 'USD' && formData.usd_payment_method === 'PayPal') {
      total += PAYPAL_DETAILS.handlingFee;
    }
    
    return {
      base,
      total,
      currency: selectedBatchObj.currency,
      symbol: selectedBatchObj.currency === 'USD' ? '$' : '₹'
    };
  }, [selectedBatchObj, selectedStudent, attendanceCount, formData.usd_payment_method]);

  const currentMonthName = useMemo(() => {
    return new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.batch_name || !formData.reg_no || !formData.txn_id) {
      setError("Please fill in all required fields.");
      return;
    }

    if (attendanceCount === 0) {
      setError("No attendance records found for this month. Payment is not required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const paymentData = {
        student_name: selectedStudent?.name,
        reg_no: formData.reg_no,
        batch_name: formData.batch_name,
        payment_frequency: 'Per-Class (Online)',
        period_paid: currentMonthName,
        classes_attended: attendanceCount,
        amount_paid: calculation.total,
        currency: calculation.currency,
        payment_method: calculation.currency === 'USD' ? formData.usd_payment_method : 'TDR ICICI',
        transaction_id: formData.txn_id,
        payment_date: new Date().toISOString()
      };

      await addDoc(collection(db, 'payments'), paymentData);
      
      setReceiptData({
        ...paymentData,
        date: new Date().toLocaleString('en-IN')
      });

      setFormData({
        batch_name: '',
        reg_no: '',
        txn_id: '',
        usd_payment_method: 'Bank'
      });
      setAttendanceCount(0);

    } catch (err) {
      console.error("Error submitting payment:", err);
      setError("Failed to submit payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-sans print:py-0 print:bg-white">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden print:hidden">
        
        {/* Header */}
        <div className="bg-[#673ab7] px-6 py-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
          <div className="mx-auto bg-white/20 h-16 w-16 rounded-full flex items-center justify-center mb-4 relative z-10">
            <Globe className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight relative z-10">Online Fee Portal</h1>
          <p className="text-purple-100 mt-2 text-sm relative z-10">Global Access • Abhinava Dance Company</p>
        </div>

        <div className="px-6 py-8">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Batch Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Online Batch</label>
              <select
                name="batch_name"
                value={formData.batch_name}
                onChange={handleInputChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#673ab7] focus:ring-2 focus:ring-[#673ab7] focus:outline-none"
                required
              >
                <option value="">-- Select a Batch --</option>
                {ONLINE_BATCHES.map(b => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Student Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Student</label>
              <select
                name="reg_no"
                value={formData.reg_no}
                onChange={handleInputChange}
                disabled={!formData.batch_name || students.length === 0}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#673ab7] focus:ring-2 focus:ring-[#673ab7] focus:outline-none disabled:bg-gray-100"
                required
              >
                <option value="">-- Select Student Name --</option>
                {students.map(s => (
                  <option key={s.reg_no} value={s.reg_no}>{s.name} ({s.reg_no})</option>
                ))}
              </select>
            </div>

            {/* Attendance & Amount Display */}
            {selectedStudent && (
              <div className="bg-purple-50 rounded-xl p-5 border border-purple-100 my-6 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-purple-200">
                  <span className="text-sm text-purple-800 font-medium">Month</span>
                  <span className="text-sm font-bold text-purple-900 bg-purple-200 px-3 py-1 rounded-full">{currentMonthName}</span>
                </div>
                
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Classes Attended:</span>
                  <span className="text-lg font-bold text-gray-900">{attendanceCount}</span>
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-gray-600">Rate per Class:</span>
                  <span className="text-sm font-medium text-gray-900">{calculation.symbol}{selectedBatchObj?.fee}</span>
                </div>

                {/* PayPal Breakdown */}
                {selectedBatchObj?.currency === 'USD' && formData.usd_payment_method === 'PayPal' && (
                  <div className="bg-white/60 p-3 rounded-lg mb-4 text-xs space-y-2 border border-purple-200">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Base Amount:</span>
                      <span className="font-medium">${calculation.base}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">PayPal Handling Fee:</span>
                      <span className="font-medium text-orange-600">+${PAYPAL_DETAILS.handlingFee}</span>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-lg p-4 text-center shadow-sm">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Total Amount Due</p>
                  <p className={`text-4xl font-extrabold ${attendanceCount === 0 ? 'text-gray-400' : 'text-[#673ab7]'}`}>
                    {calculation.symbol}{calculation.total.toLocaleString('en-US')}
                  </p>
                  {attendanceCount === 0 && (
                    <p className="text-xs text-red-500 mt-2 font-medium">No attendance found. Payment disabled.</p>
                  )}
                </div>
              </div>
            )}

            {/* ROUTING LOGIC: PAYMENT DETAILS */}
            {selectedStudent && attendanceCount > 0 && selectedBatchObj && (
              <div className="border border-gray-200 rounded-xl p-5 bg-white shadow-sm my-6">
                
                {/* --- USD ROUTING --- */}
                {selectedBatchObj.currency === 'USD' ? (
                  <>
                    <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center">
                      <Globe className="w-4 h-4 mr-2 text-[#673ab7]" /> International Payment
                    </h2>
                    
                    <select
                      name="usd_payment_method"
                      value={formData.usd_payment_method}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#673ab7] mb-4"
                    >
                      <option value="Bank">Direct Bank Transfer</option>
                      <option value="Zelle">Zelle Transfer</option>
                      <option value="PayPal">PayPal</option>
                    </select>

                    <div className="bg-gray-50 rounded-lg p-4 text-sm border border-gray-200">
                      {formData.usd_payment_method === 'Bank' && (
                        <div className="space-y-2 text-gray-700">
                          <p><span className="font-semibold text-gray-900">Bank:</span> {USD_BANK_DETAILS.bank}</p>
                          <p><span className="font-semibold text-gray-900">Name:</span> {USD_BANK_DETAILS.name}</p>
                          <p><span className="font-semibold text-gray-900">Account No:</span> {USD_BANK_DETAILS.account}</p>
                          <p><span className="font-semibold text-gray-900">Routing/Swift:</span> {USD_BANK_DETAILS.routing}</p>
                        </div>
                      )}
                      
                      {formData.usd_payment_method === 'Zelle' && (
                        <div className="space-y-3 text-center">
                          <div className="bg-purple-100 text-purple-800 p-3 rounded font-medium">
                            {ZELLE_DETAILS.email}
                          </div>
                          <p className="text-xs text-gray-600">{ZELLE_DETAILS.instruction}</p>
                        </div>
                      )}

                      {formData.usd_payment_method === 'PayPal' && (
                        <div className="flex flex-col items-center">
                          <img src={PAYPAL_DETAILS.qrBase64} alt="PayPal QR" className="w-32 h-32 object-contain mb-3 border p-1 rounded bg-white" />
                          <p className="text-xs text-gray-600 text-center mb-2">Scan QR code using the PayPal app.</p>
                          <a href={PAYPAL_DETAILS.qrBase64} download={PAYPAL_DETAILS.fileName} className="text-xs text-[#673ab7] font-medium hover:underline">Download QR Code</a>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  /* --- INR ROUTING --- */
                  <div className="flex flex-col items-center text-center">
                    <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center">
                      <MapPin className="w-4 h-4 mr-2 text-[#673ab7]" /> Indian Payment (UPI)
                    </h2>
                    <img src={INR_BANK_DETAILS.qrBase64} alt="ICICI TDR QR" className="w-40 h-40 object-contain mb-4 border-2 border-gray-100 rounded-xl p-2" />
                    <a href={INR_BANK_DETAILS.qrBase64} download={INR_BANK_DETAILS.fileName} className="bg-[#673ab7] text-white text-xs px-4 py-1.5 rounded-full hover:bg-purple-800 transition-colors mb-4">Download QR</a>
                    
                    <div className="bg-gray-50 rounded-lg p-3 w-full text-left text-xs border border-gray-200 space-y-1.5">
                      <p><span className="font-semibold text-gray-600">Bank:</span> {INR_BANK_DETAILS.bank}</p>
                      <p><span className="font-semibold text-gray-600">Name:</span> {INR_BANK_DETAILS.name}</p>
                      <p><span className="font-semibold text-gray-600">A/c:</span> {INR_BANK_DETAILS.account}</p>
                      <p><span className="font-semibold text-gray-600">IFSC:</span> {INR_BANK_DETAILS.ifsc}</p>
                      <p><span className="font-semibold text-gray-600">UPI ID:</span> {INR_BANK_DETAILS.upi}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Transaction ID Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {selectedBatchObj?.currency === 'USD' ? 'Reference / Receipt Number' : '12-Digit UPI Transaction ID'}
              </label>
              <input
                type="text"
                name="txn_id"
                value={formData.txn_id}
                onChange={handleInputChange}
                placeholder={selectedBatchObj?.currency === 'USD' ? "e.g. WF123456789" : "e.g. 123456789012"}
                maxLength={selectedBatchObj?.currency === 'USD' ? 20 : 12}
                minLength={selectedBatchObj?.currency === 'USD' ? 5 : 12}
                pattern={selectedBatchObj?.currency === 'USD' ? undefined : "\\d{12}"}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#673ab7] focus:ring-2 focus:ring-[#673ab7] focus:outline-none uppercase"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting || attendanceCount === 0 || loading}
              className="w-full bg-[#673ab7] hover:bg-purple-800 text-white font-medium py-3 px-4 rounded-lg shadow transition-all focus:outline-none focus:ring-2 focus:ring-[#673ab7] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center mt-6"
            >
              {submitting ? 'Processing...' : `Submit Payment of ${calculation.symbol}${calculation.total}`}
            </button>
          </form>
        </div>
      </div>

      {/* RECEIPT MODAL OVERLAY */}
      {receiptData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:static print:bg-transparent print:p-0">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 print:shadow-none print:w-full print:max-w-none">
            <div className="bg-green-600 px-6 py-5 text-center relative">
              <button onClick={() => setReceiptData(null)} className="absolute top-4 right-4 text-white/80 hover:text-white print:hidden">
                <X className="h-6 w-6" />
              </button>
              <div className="mx-auto bg-white/20 h-14 w-14 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">Payment Successful!</h2>
              <p className="text-green-100 mt-1 text-sm">Abhinava Dance School - Online</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-gray-500 text-sm">Student</span>
                <span className="font-bold text-gray-900">{receiptData.student_name}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-gray-500 text-sm">Batch</span>
                <span className="font-medium text-gray-900">{receiptData.batch_name}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-gray-500 text-sm">Classes Billed ({receiptData.period_paid})</span>
                <span className="font-medium text-gray-900">{receiptData.classes_attended} Classes</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-gray-500 text-sm">Method</span>
                <span className="font-medium text-gray-900">{receiptData.payment_method}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-gray-500 text-sm">Reference ID</span>
                <span className="font-mono text-gray-900 uppercase">{receiptData.transaction_id}</span>
              </div>
              <div className="flex justify-between pt-2 items-center">
                <span className="text-gray-600 font-bold uppercase tracking-wider text-sm">Total Paid</span>
                <span className="text-2xl font-black text-green-600">
                  {receiptData.currency === 'USD' ? '$' : '₹'}{receiptData.amount_paid.toLocaleString('en-US')}
                </span>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-gray-50 flex gap-3 print:hidden">
              <button onClick={() => window.print()} className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-100">
                Print
              </button>
              <button onClick={() => setReceiptData(null)} className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
