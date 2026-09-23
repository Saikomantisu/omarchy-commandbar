.pragma library

// Lower-case city / country / abbreviation → IANA zone. Abbreviations map to
// the zone, not a fixed offset, so "pst" in July honestly reports PDT.
var CITIES = {
  "utc": "UTC", "gmt": "UTC", "z": "UTC", "zulu": "UTC",

  // South Asia
  "colombo": "Asia/Colombo", "sri lanka": "Asia/Colombo", "lanka": "Asia/Colombo", "lkt": "Asia/Colombo", "slst": "Asia/Colombo", "kandy": "Asia/Colombo",
  "india": "Asia/Kolkata", "ist": "Asia/Kolkata", "delhi": "Asia/Kolkata", "new delhi": "Asia/Kolkata", "mumbai": "Asia/Kolkata", "bangalore": "Asia/Kolkata", "bengaluru": "Asia/Kolkata", "chennai": "Asia/Kolkata", "kolkata": "Asia/Kolkata", "hyderabad": "Asia/Kolkata",
  "karachi": "Asia/Karachi", "pakistan": "Asia/Karachi", "pkt": "Asia/Karachi", "lahore": "Asia/Karachi",
  "dhaka": "Asia/Dhaka", "bangladesh": "Asia/Dhaka",
  "kathmandu": "Asia/Kathmandu", "nepal": "Asia/Kathmandu",
  "male": "Indian/Maldives", "maldives": "Indian/Maldives",

  // East / South-East Asia & Oceania
  "tokyo": "Asia/Tokyo", "japan": "Asia/Tokyo", "jst": "Asia/Tokyo", "osaka": "Asia/Tokyo",
  "seoul": "Asia/Seoul", "korea": "Asia/Seoul", "kst": "Asia/Seoul",
  "beijing": "Asia/Shanghai", "shanghai": "Asia/Shanghai", "china": "Asia/Shanghai", "shenzhen": "Asia/Shanghai",
  "hong kong": "Asia/Hong_Kong", "hk": "Asia/Hong_Kong", "hkt": "Asia/Hong_Kong",
  "taipei": "Asia/Taipei", "taiwan": "Asia/Taipei",
  "singapore": "Asia/Singapore", "sgt": "Asia/Singapore", "sg": "Asia/Singapore",
  "kuala lumpur": "Asia/Kuala_Lumpur", "kl": "Asia/Kuala_Lumpur", "malaysia": "Asia/Kuala_Lumpur",
  "bangkok": "Asia/Bangkok", "thailand": "Asia/Bangkok",
  "jakarta": "Asia/Jakarta", "indonesia": "Asia/Jakarta",
  "manila": "Asia/Manila", "philippines": "Asia/Manila",
  "hanoi": "Asia/Ho_Chi_Minh", "ho chi minh": "Asia/Ho_Chi_Minh", "saigon": "Asia/Ho_Chi_Minh", "vietnam": "Asia/Ho_Chi_Minh",
  "sydney": "Australia/Sydney", "melbourne": "Australia/Melbourne", "aest": "Australia/Sydney", "aedt": "Australia/Sydney",
  "brisbane": "Australia/Brisbane", "perth": "Australia/Perth", "adelaide": "Australia/Adelaide",
  "auckland": "Pacific/Auckland", "new zealand": "Pacific/Auckland", "nz": "Pacific/Auckland", "nzst": "Pacific/Auckland",

  // Middle East & Africa
  "dubai": "Asia/Dubai", "abu dhabi": "Asia/Dubai", "uae": "Asia/Dubai", "gst": "Asia/Dubai",
  "doha": "Asia/Qatar", "qatar": "Asia/Qatar", "riyadh": "Asia/Riyadh", "saudi": "Asia/Riyadh",
  "kuwait": "Asia/Kuwait", "muscat": "Asia/Muscat", "oman": "Asia/Muscat", "bahrain": "Asia/Bahrain",
  "tehran": "Asia/Tehran", "istanbul": "Europe/Istanbul", "turkey": "Europe/Istanbul",
  "tel aviv": "Asia/Jerusalem", "jerusalem": "Asia/Jerusalem", "israel": "Asia/Jerusalem",
  "cairo": "Africa/Cairo", "egypt": "Africa/Cairo", "nairobi": "Africa/Nairobi", "kenya": "Africa/Nairobi",
  "lagos": "Africa/Lagos", "nigeria": "Africa/Lagos", "johannesburg": "Africa/Johannesburg", "south africa": "Africa/Johannesburg",

  // Europe
  "london": "Europe/London", "uk": "Europe/London", "bst": "Europe/London", "dublin": "Europe/Dublin", "ireland": "Europe/Dublin",
  "lisbon": "Europe/Lisbon", "portugal": "Europe/Lisbon",
  "paris": "Europe/Paris", "france": "Europe/Paris", "cet": "Europe/Paris", "cest": "Europe/Paris",
  "berlin": "Europe/Berlin", "germany": "Europe/Berlin", "munich": "Europe/Berlin", "frankfurt": "Europe/Berlin",
  "amsterdam": "Europe/Amsterdam", "netherlands": "Europe/Amsterdam", "brussels": "Europe/Brussels",
  "madrid": "Europe/Madrid", "spain": "Europe/Madrid", "barcelona": "Europe/Madrid",
  "rome": "Europe/Rome", "italy": "Europe/Rome", "milan": "Europe/Rome",
  "zurich": "Europe/Zurich", "switzerland": "Europe/Zurich", "vienna": "Europe/Vienna",
  "stockholm": "Europe/Stockholm", "oslo": "Europe/Oslo", "copenhagen": "Europe/Copenhagen", "helsinki": "Europe/Helsinki",
  "warsaw": "Europe/Warsaw", "prague": "Europe/Prague", "athens": "Europe/Athens", "eet": "Europe/Athens",
  "kyiv": "Europe/Kyiv", "kiev": "Europe/Kyiv", "moscow": "Europe/Moscow", "msk": "Europe/Moscow",

  // Americas
  "new york": "America/New_York", "nyc": "America/New_York", "ny": "America/New_York", "boston": "America/New_York", "miami": "America/New_York", "washington": "America/New_York", "toronto": "America/Toronto",
  "est": "America/New_York", "edt": "America/New_York", "et": "America/New_York", "eastern": "America/New_York",
  "chicago": "America/Chicago", "dallas": "America/Chicago", "houston": "America/Chicago", "austin": "America/Chicago",
  "cst": "America/Chicago", "cdt": "America/Chicago", "ct": "America/Chicago", "central": "America/Chicago",
  "denver": "America/Denver", "mst": "America/Denver", "mdt": "America/Denver", "mt": "America/Denver", "mountain": "America/Denver",
  "phoenix": "America/Phoenix",
  "los angeles": "America/Los_Angeles", "la": "America/Los_Angeles", "san francisco": "America/Los_Angeles", "sf": "America/Los_Angeles", "seattle": "America/Los_Angeles", "vancouver": "America/Vancouver",
  "pst": "America/Los_Angeles", "pdt": "America/Los_Angeles", "pt": "America/Los_Angeles", "pacific": "America/Los_Angeles",
  "anchorage": "America/Anchorage", "alaska": "America/Anchorage", "honolulu": "Pacific/Honolulu", "hawaii": "Pacific/Honolulu", "hst": "Pacific/Honolulu",
  "mexico city": "America/Mexico_City", "mexico": "America/Mexico_City",
  "sao paulo": "America/Sao_Paulo", "são paulo": "America/Sao_Paulo", "brazil": "America/Sao_Paulo", "rio": "America/Sao_Paulo",
  "buenos aires": "America/Argentina/Buenos_Aires", "argentina": "America/Argentina/Buenos_Aires",
  "bogota": "America/Bogota", "lima": "America/Lima", "santiago": "America/Santiago"
}

// Every distinct IANA zone above plus any extras, for the offset probe.
function allZones(extra) {
  var seen = {}
  var out = []
  function add(z) { if (z && !seen[z]) { seen[z] = true; out.push(z) } }
  for (var k in CITIES) add(CITIES[k])
  for (var i = 0; extra && i < extra.length; i++) add(extra[i])
  return out
}
