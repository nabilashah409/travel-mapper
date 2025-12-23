import requests
import sys
from datetime import datetime

class JourneyMapperAPITester:
    def __init__(self, base_url="https://dispute-remedy.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                if response.text:
                    print(f"Response: {response.text[:200]}...")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"Response: {response.text[:200]}...")

            return success, response.json() if response.text and response.status_code < 500 else {}

        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timeout")
            return False, {}
        except requests.exceptions.ConnectionError:
            print(f"❌ Failed - Connection error")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        success, response = self.run_test(
            "Root API Endpoint",
            "GET",
            "api/",
            200
        )
        return success

    def test_create_route(self):
        """Test creating a route"""
        test_route_data = {
            "destinations": [
                {"name": "New York", "lat": 40.7128, "lng": -74.0060},
                {"name": "Los Angeles", "lat": 34.0522, "lng": -118.2437}
            ],
            "transport_mode": "flight"
        }
        
        success, response = self.run_test(
            "Create Route",
            "POST",
            "api/routes",
            200,
            data=test_route_data
        )
        return response.get('id') if success else None

    def test_get_routes(self):
        """Test getting all routes"""
        success, response = self.run_test(
            "Get All Routes",
            "GET",
            "api/routes",
            200
        )
        return success

def main():
    print("🚀 Starting Journey Mapper API Tests...")
    
    # Setup
    tester = JourneyMapperAPITester()

    # Run tests
    print("\n" + "="*50)
    print("BACKEND API TESTING")
    print("="*50)

    # Test root endpoint
    root_success = tester.test_root_endpoint()
    
    # Test route creation
    route_id = tester.test_create_route()
    
    # Test getting routes
    get_routes_success = tester.test_get_routes()

    # Print results
    print(f"\n📊 BACKEND TEST RESULTS")
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("✅ All backend tests passed!")
        return 0
    else:
        print("❌ Some backend tests failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())