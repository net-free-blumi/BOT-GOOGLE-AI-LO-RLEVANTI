import { parseRideRoute, extractDispatcherPhone } from "./geo-helper.js";

// Test 1: שמש פנימי 50 ש רמה א > רמה ד
const t1 = parseRideRoute("⚠️ שמש פנימי 50 ש רמה א > רמה ד ביט זמנים wa.me/972552732722?text=ת+516735753");
console.log("Test 1 Result:", {
  origin: t1.originNeighborhood,
  dest: t1.destNeighborhood,
  internal: t1.isInternal,
  price: t1.price,
  phone: t1.dispatcherPhone,
});
if (t1.originNeighborhood !== "רמת בית שמש א'") throw new Error(`Test 1 origin mismatch: got ${t1.originNeighborhood}`);
if (t1.destNeighborhood !== "רמת בית שמש ד'") throw new Error(`Test 1 dest mismatch: got ${t1.destNeighborhood}`);
if (!t1.isInternal) throw new Error("Test 1 should be internal");
if (t1.price !== 50) throw new Error("Test 1 price should be 50");
if (t1.dispatcherPhone !== "0552732722") throw new Error(`Test 1 phone should be 0552732722, got ${t1.dispatcherPhone}`);

// Test 2: מב לד 50 שח
const t2 = parseRideRoute("מב לד 50 שח");
console.log("Test 2 Result:", {
  origin: t2.originNeighborhood,
  dest: t2.destNeighborhood,
  price: t2.price,
});
if (t2.originNeighborhood !== "רמת בית שמש ב'") throw new Error(`Test 2 origin mismatch: got ${t2.originNeighborhood}`);
if (t2.destNeighborhood !== "רמת בית שמש ד'") throw new Error(`Test 2 dest mismatch: got ${t2.destNeighborhood}`);

// Test 3: פנימי שמש 40 רמה ג לרמה ד חולדה הנביאה זמן
const t3 = parseRideRoute("פנימי שמש 40 רמה ג לרמה ד חולדה הנביאה זמן");
console.log("Test 3 Result:", {
  origin: t3.originNeighborhood,
  dest: t3.destNeighborhood,
  price: t3.price,
});
if (t3.originNeighborhood !== "רמת בית שמש ג'") throw new Error(`Test 3 origin mismatch: got ${t3.originNeighborhood}`);
if (t3.destNeighborhood !== "רמת בית שמש ד'") throw new Error(`Test 3 dest mismatch: got ${t3.destNeighborhood}`);

// Test 4: 0509150218 שמואל הנביא לבקש ב 100 שמש יער צרעה
const t4 = parseRideRoute("0509150218 שמואל הנביא לבקש ב 100 שמש יער צרעה");
console.log("Test 4 Result:", {
  origin: t4.originNeighborhood,
  price: t4.price,
  phone: t4.dispatcherPhone,
});
if (t4.price !== 100) throw new Error(`Test 4 price mismatch: got ${t4.price}`);
if (t4.dispatcherPhone !== "0509150218") throw new Error(`Test 4 phone mismatch: got ${t4.dispatcherPhone}`);

console.log("🎉 All 4 User Bug Scenario Tests Passed with 100% Precision!");
