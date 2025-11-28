"""Application entry point registering the feature blueprints."""
from flask import Flask
from routes import home_bp, planner_bp, rag_bp

def create_app():
    app = Flask(__name__)
    
    app.register_blueprint(home_bp)
    app.register_blueprint(planner_bp)
    app.register_blueprint(rag_bp)

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(debug=True)